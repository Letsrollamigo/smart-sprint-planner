import type { IExecuteFunctions } from 'n8n-workflow';
import { bodyRev, makeOps, slotRev, withRev } from '../shared/ops.js';
import { PlannerRefusal } from '../shared/errors.js';
import { makePlannerCall, type Call } from '../transport/planner';

export type Ops = ReturnType<typeof makeOps>;
export type RevKind = 'slot' | 'abs' | 'rel';
export type Obj = Record<string, unknown>;
export type Written = { result: Obj; retried: boolean };

/** Контекст одного запуска ноды: операции контракта и память ревизий «проект × реестр» между элементами. */
export class RunContext {
	readonly call: Call;

	readonly ops: Ops;

	private readonly revs = new Map<string, number>();

	constructor(readonly fn: IExecuteFunctions) {
		this.call = makePlannerCall(fn);
		this.ops = makeOps({ call: this.call });
	}

	/** Ревизия реестра: из памяти запуска, иначе (или при `fresh`) — чтением контракта. */
	async readRev(kind: RevKind, key: string, fresh = false): Promise<number> {
		const k = key + ':' + kind;
		const known = this.revs.get(k);
		if (known !== undefined && !fresh) return known;
		const rev =
			kind === 'slot'
				? slotRev(await this.ops.sprintData(key))
				: bodyRev(await (kind === 'abs' ? this.ops.absences(key) : this.ops.releases(key)));
		this.revs.set(k, rev);
		return rev;
	}

	/** Ревизия после записи (или из отказа rev_conflict); неизвестна — забыть, следующий элемент перечитает. */
	remember(kind: RevKind, key: string, rev: unknown): void {
		const k = key + ':' + kind;
		if (typeof rev === 'number') this.revs.set(k, rev);
		else this.revs.delete(k);
	}

	/**
	 * Точечная запись с ревизией: `baseRev` из Options — один вызов без повтора; иначе ревизия из памяти
	 * или чтения и ровно один повтор при rev_conflict (повторное чтение — мимо памяти).
	 */
	write(kind: RevKind, key: string, baseRev: number | undefined, run: (rev: number) => Promise<Obj>, retry = true): Promise<Written> {
		let reads = 0;
		const readRev = () => this.readRev(kind, key, reads++ > 0);
		return withRev({ baseRev, readRev, run, retry }).then(
			(r) => {
				this.remember(kind, key, r.result.rev);
				return r;
			},
			(e: unknown) => {
				this.remember(kind, key, e instanceof PlannerRefusal && e.reason === 'rev_conflict' ? e.rev : undefined);
				throw e;
			},
		);
	}
}

/** Вывод точечной записи: ревизия, что применено, был ли повтор (и ревизия истории у назначения). */
export function written(r: Written): Obj {
	const out: Obj = { rev: r.result.rev ?? null, applied: r.result.applied ?? null, retried: r.retried };
	if (r.result.historyRev !== undefined) out.historyRev = r.result.historyRev;
	return out;
}
