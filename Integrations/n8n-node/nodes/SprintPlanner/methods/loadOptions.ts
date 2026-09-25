import type { ILoadOptionsFunctions, INodePropertyOptions } from 'n8n-workflow';
import { T } from '../i18n';
import { ytGet } from '../transport/youtrack';
import { currentProjectKey } from './listSearch';

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);

export const loadOptions = {
	/** Поля проекта для «Записать поле»: значение `<id>|<fieldType.id>`; многозначные — с пометкой (v1 их не пишет). */
	async getProjectFields(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
		const key = currentProjectKey(this);
		if (!key) return [];
		const list = await ytGet(this, `/api/admin/projects/${encodeURIComponent(key)}/customFields`, { fields: 'id,field(name,fieldType(id))', $top: 200 });
		return (Array.isArray(list) ? list : [])
			.filter(isObj)
			.map((pf) => {
				const f = isObj(pf.field) ? pf.field : {};
				const type = isObj(f.fieldType) ? String(f.fieldType.id) : '';
				const name = String(f.name ?? pf.id);
				return { name: type.endsWith('[*]') ? `${name} ${T.lists.multiValue}` : name, value: `${pf.id}|${type}`, description: type };
			})
			.sort((a, b) => a.name.localeCompare(b.name));
	},
};
