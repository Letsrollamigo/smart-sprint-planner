// @ts-check
/** Zod-схемы входов инструментов. Все объекты строгие; описания полей — из словаря. */
import { z } from 'zod';
import { ROLE_KEYS, INCLUSION_STATUSES, ABSENCE_TYPES, RELEASE_STATUSES, RELEASE_KINDS, RELEASE_SOURCES, SPRINT_STATUSES, LIMITS } from './constants.js';

/** @param {(key: string, params?: Record<string, unknown>) => string} t */
export function makeSchemas(t) {
  const d = (/** @type {string} */ k) => t('fields.' + k);
  const ProjectKey = z.string().min(1).max(100).describe(d('projectKey'));
  const RoleKey = z.enum(ROLE_KEYS).describe(d('roleKey'));
  const IssueId = z.string().regex(/^[A-Za-z][A-Za-z0-9_]*-\d+$/).describe(d('issueId'));
  const Login = z.string().min(1).max(200);
  const Minutes = z.number().int().min(0).max(100000000);
  const EpochMs = z.number().int().min(0);
  const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
  const BaseRev = z.number().int().min(0).optional().describe(d('baseRev'));
  const Resources = z.partialRecord(z.enum(ROLE_KEYS), Minutes).describe(d('resources'));

  const ItemIn = z.object({
    issueId: IssueId,
    title: z.string().max(500).optional().describe(d('title')),
    inclusionStatus: z.enum(INCLUSION_STATUSES).optional().describe(d('inclusionStatus')),
    estimate: Minutes.optional().describe(d('estimate')),
    fact: Minutes.optional().describe(d('fact')),
    alloc: Minutes.optional().describe(d('alloc')),
    excludeReason: z.string().max(500).optional().describe(d('excludeReason')),
    assignee: Login.nullable().optional().describe(d('assignee')),
    externalTicketId: z.string().max(200).optional()
  }).strict();

  const SprintCore = {
    name: z.string().min(1).max(500).describe(d('sprintName')),
    dateStart: EpochMs.describe(d('dateStart')),
    dateEnd: EpochMs.describe(d('dateEnd')),
    sprintGoal: z.string().max(500).optional().describe(d('sprintGoal')),
    roles: z.array(z.enum(ROLE_KEYS)).max(9).optional().describe(d('roles')),
    sprintFieldVal: z.string().max(500).optional().describe(d('sprintFieldVal')),
    versionFieldVal: z.string().max(500).optional().describe(d('versionFieldVal')),
    resources: Resources.optional()
  };
  const SprintIn = z.object({ sprintId: z.string().min(1).max(100).describe(d('sprintId')), ...SprintCore }).strict();
  const SprintPatch = z.object({
    name: SprintCore.name.optional(), dateStart: SprintCore.dateStart.optional(), dateEnd: SprintCore.dateEnd.optional(),
    sprintGoal: SprintCore.sprintGoal, sprintFieldVal: SprintCore.sprintFieldVal, versionFieldVal: SprintCore.versionFieldVal, resources: SprintCore.resources
  }).strict();

  const AbsenceIn = z.object({
    from: IsoDate.describe(d('absenceFrom')), to: IsoDate.describe(d('absenceTo')),
    type: z.enum(ABSENCE_TYPES).describe(d('absenceType')),
    hoursDelta: z.number().min(0.5).max(24).nullable().optional().describe(d('hoursDelta'))
  }).strict();

  const PersonIn = z.object({
    grade: z.string().max(64).nullable().optional().describe(d('grade')),
    rate: z.number().min(0).max(1).nullable().optional().describe(d('rate')),
    participation: z.number().min(0).max(1).nullable().optional().describe(d('participation')),
    alloc: z.partialRecord(z.enum(ROLE_KEYS), z.number().min(0).max(1)).nullable().optional().describe(d('personAlloc'))
  }).strict();

  const ReleaseIn = z.object({
    id: z.string().min(1).max(64).describe(d('releaseId')),
    name: z.string().max(200).nullable().optional(),
    kind: z.enum(RELEASE_KINDS).nullable().optional().describe(d('releaseKind')),
    source: z.enum(RELEASE_SOURCES).nullable().optional().describe(d('releaseSource')),
    status: z.enum(RELEASE_STATUSES).nullable().optional().describe(d('releaseStatus')),
    plannedDate: EpochMs.nullable().optional().describe(d('plannedDate')),
    freezeDate: EpochMs.nullable().optional().describe(d('freezeDate')),
    freezeLocked: z.boolean().nullable().optional(),
    patchNote: z.string().max(20000).nullable().optional(),
    notes: z.string().max(20000).nullable().optional(),
    taskUrl: z.string().max(2000).nullable().optional(),
    roleReps: z.partialRecord(z.enum(ROLE_KEYS), z.string().max(128).nullable()).nullable().optional().describe(d('roleReps'))
  }).strict();

  const Issues = z.array(z.string().min(1).max(64)).max(2000);

  return {
    ProjectKey, RoleKey, IssueId, Login, Minutes, EpochMs, IsoDate, BaseRev, Resources, ItemIn, SprintIn, SprintPatch, AbsenceIn, PersonIn, ReleaseIn, Issues,
    read: {
      overview: z.object({ projectKey: ProjectKey }).strict(),
      sprint: z.object({ projectKey: ProjectKey, roleKey: RoleKey.optional(), includeExcluded: z.boolean().default(true).describe(d('includeExcluded')),
        includeSettings: z.boolean().default(false).describe(d('includeSettings')), limit: z.number().int().min(1).max(1000).default(LIMITS.itemsPerRole).describe(d('limitPerRole')) }).strict(),
      history: z.object({ projectKey: ProjectKey, sprintId: z.string().max(100).optional().describe(d('sprintIdFilter')), roleKey: RoleKey.optional(),
        status: z.enum(SPRINT_STATUSES).optional().describe(d('sprintStatus')), limit: z.number().int().min(1).max(500).default(LIMITS.history).describe(d('limit')),
        includeItems: z.boolean().default(false).describe(d('includeItems')) }).strict(),
      capacity: z.object({ projectKey: ProjectKey, sprintId: z.string().max(100).optional().describe(d('sprintIdDefault')), includeArchive: z.boolean().default(false).describe(d('includeArchive')) }).strict(),
      calendar: z.object({ projectKey: ProjectKey, year: z.number().int().min(2000).max(2100).optional().describe(d('year')) }).strict(),
      absences: z.object({ projectKey: ProjectKey, login: Login.optional().describe(d('loginFilter')), from: IsoDate.optional().describe(d('periodFrom')), to: IsoDate.optional().describe(d('periodTo')) }).strict(),
      releases: z.object({ projectKey: ProjectKey, status: z.enum(RELEASE_STATUSES).optional().describe(d('releaseStatusFilter')), includeArchive: z.boolean().default(false).describe(d('includeArchive')) }).strict(),
      reminders: z.object({ projectKey: ProjectKey, includeJournal: z.boolean().default(false).describe(d('includeJournal')) }).strict(),
      filterProjects: z.object({ keys: z.array(z.string().min(1).max(100)).max(5000).describe(d('projectKeys')) }).strict(),
      myRoles: z.object({ projectKey: ProjectKey }).strict()
    },
    write: {
      uploadDraft: z.object({ projectKey: ProjectKey, sprint: SprintIn.describe(d('sprint')), roleItems: z.partialRecord(z.enum(ROLE_KEYS), z.array(ItemIn).max(1000)).describe(d('roleItems')),
        overwrite: z.boolean().default(false).describe(d('overwrite')), baseRev: BaseRev }).strict(),
      upsertItem: z.object({ projectKey: ProjectKey, roleKey: RoleKey, item: ItemIn.describe(d('item')), baseRev: BaseRev }).strict(),
      removeItem: z.object({ projectKey: ProjectKey, roleKey: RoleKey, issueId: IssueId, baseRev: BaseRev }).strict(),
      patchSprint: z.object({ projectKey: ProjectKey, sprint: SprintPatch.describe(d('sprintPatch')), baseRev: BaseRev }).strict(),
      assignPerson: z.object({ projectKey: ProjectKey, roleKey: RoleKey, issueId: IssueId, login: Login.nullable().describe(d('assignLogin')),
        dateStart: EpochMs.nullable().optional().describe(d('assignDateStart')), dateEnd: EpochMs.nullable().optional().describe(d('assignDateEnd')), baseRev: BaseRev }).strict(),
      upsertAbsence: z.object({ projectKey: ProjectKey, login: Login.describe(d('login')), entry: AbsenceIn.describe(d('entry')), baseRev: BaseRev }).strict(),
      removeAbsence: z.object({ projectKey: ProjectKey, login: Login.describe(d('login')), from: IsoDate.describe(d('absenceFrom')), to: IsoDate.describe(d('absenceTo')), baseRev: BaseRev }).strict(),
      upsertCapacityPerson: z.object({ projectKey: ProjectKey, sprintId: z.string().max(100).optional().describe(d('sprintIdDefault')), login: Login.describe(d('login')), person: PersonIn.describe(d('person')) }).strict(),
      upsertRelease: z.object({ projectKey: ProjectKey, release: ReleaseIn.describe(d('release')), baseRev: BaseRev }).strict(),
      setReleaseStatus: z.object({ projectKey: ProjectKey, id: z.string().min(1).max(64).describe(d('releaseId')), status: z.enum(RELEASE_STATUSES).describe(d('releaseStatus')),
        snapshot: z.record(z.string(), z.unknown()).optional().describe(d('snapshot')), baseRev: BaseRev }).strict(),
      updateReleaseIssues: z.object({ projectKey: ProjectKey, id: z.string().min(1).max(64).describe(d('releaseId')), add: Issues.optional().describe(d('issuesAdd')), remove: Issues.optional().describe(d('issuesRemove')), baseRev: BaseRev }).strict(),
      removeRelease: z.object({ projectKey: ProjectKey, id: z.string().min(1).max(64).describe(d('releaseId')), baseRev: BaseRev }).strict()
    }
  };
}

/** Выходные схемы — нестрогие (ответы контракта расширяются). */
const Any = z.unknown();
const loose = (/** @type {Record<string, z.ZodType>} */ shape) => z.object(shape).loose();
export const OUT = {
  overview: loose({ version: Any, contractOk: z.boolean(), configured: Any, activeRoles: Any, sprint: Any, sprintCreationLocked: Any, releases: Any }),
  sprint: loose({ sprint: Any, activeRoles: Any, items: Any, configured: Any }),
  history: loose({ rev: z.number(), total: z.number(), count: z.number(), hasMore: z.boolean(), records: z.array(Any) }),
  capacity: loose({ sprintId: Any, capacity: Any }),
  calendar: loose({ years: Any }),
  absences: loose({ rev: z.number(), absences: Any }),
  releases: loose({ rev: z.number(), perms: Any, releases: z.array(Any) }),
  reminders: loose({ enabled: Any, items: z.array(Any) }),
  uploadDraft: loose({ rev: Any, enriched: Any, warnings: Any }),
  write: loose({ rev: Any, applied: Any, retried: z.boolean() }),
  capacityWrite: loose({ sprintId: Any, applied: Any, allocOk: Any }),
  releaseIssues: loose({ rev: Any, added: z.array(z.string()), removed: z.array(z.string()) }),
  filterProjects: loose({ projects: z.array(Any) }),
  myRoles: loose({ configured: Any, instanceAdmin: Any, roles: Any })
};
