// PER-FORK: node UI dictionary and refusal hints (community — English only).
import notes from './shared/notes.en.json';

export const NOTES: Record<string, { ru?: string; action?: string; en?: string; actionEn?: string }> = notes;

const minutesHint = 'Minutes: 8 h = 480';

export const T = {
	node: {
		displayName: 'Smart Sprint Planner',
		description:
			'Sprint and role items, history, capacity, absences, releases and planner permissions through the YouTrack REST. Write to one project sequentially; re-read the data after a series of writes.',
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
	},
	resource: 'Resource',
	operation: 'Operation',
	resources: {
		project: 'Project',
		sprint: 'Sprint',
		sprintItem: 'Sprint Item',
		history: 'History',
		capacity: 'Capacity',
		calendar: 'Calendar',
		absence: 'Absence',
		release: 'Release',
		reminder: 'Reminder',
		access: 'Access',
		issue: 'Issue',
	},
	ops: {
		project: {
			getOverview: {
				name: 'Get Overview',
				action: 'Get project overview',
				description: 'Planner version, whether it is configured, active roles, the working sprint with issue counts per role, the sprint creation lock and the release count',
			},
			getMany: {
				name: 'Get Many',
				action: 'Get many projects',
				description: 'YouTrack projects visible to the token, marked with whether the planner is attached',
			},
			getPlannerStatus: {
				name: 'Get Planner Status',
				action: 'Get planner status in project',
				description: 'Whether the planner is attached to the project, configured, not turned off, and its version',
			},
		},
		sprint: {
			get: {
				name: 'Get',
				action: 'Get sprint',
				description: 'The project working sprint: header, revision and issues by role',
			},
			uploadDraft: {
				name: 'Upload Draft',
				action: 'Upload sprint draft',
				description:
					'Write a sprint draft into the working slot entirely: header (status PLANNING) and issues by role. An occupied slot is not overwritten without "Overwrite". Role: editor.',
			},
			update: {
				name: 'Update',
				action: 'Update sprint header',
				description: 'Change the name, dates, goal, field values or role resources of the working sprint. Role: editor.',
			},
		},
		sprintItem: {
			createOrUpdate: {
				name: 'Create or Update',
				action: 'Create or update sprint item',
				description: 'Add an issue to a role or change its fields (the rest is kept). Role: editor.',
			},
			remove: {
				name: 'Remove',
				action: 'Remove issue from sprint',
				description: 'Remove an issue from the role issue list. Role: editor.',
			},
			assign: {
				name: 'Assign',
				action: 'Assign person to sprint item',
				description:
					'Assign a person to a role issue and optionally the work dates; an empty login unassigns. Works once the role was sent for confirmation. Role: assigner.',
			},
		},
		history: {
			getMany: {
				name: 'Get Many',
				action: 'Get many history records',
				description: 'Sprint snapshots by role: status, dates, who confirmed and finished, issue count',
			},
		},
		capacity: {
			get: {
				name: 'Get',
				action: 'Get capacity',
				description: 'Sprint capacity record: participants with grade, rate, participation share and allocation across roles',
			},
			createOrUpdateMember: {
				name: 'Create or Update Member',
				action: 'Create or update capacity member',
				description:
					'Add a participant to the sprint capacity or change their parameters. Without a sprint ID — the working slot sprint. Role: settings manager or planning manager.',
			},
		},
		calendar: {
			get: {
				name: 'Get',
				action: 'Get calendar',
				description: 'The project production calendar by year',
			},
		},
		absence: {
			getMany: {
				name: 'Get Many',
				action: 'Get many absences',
				description: 'Employee absences: dates, type, hours per day',
			},
			createOrUpdate: {
				name: 'Create or Update',
				action: 'Create or update absence',
				description:
					'Add an employee absence; a record with the same dates is replaced entirely. Role: settings manager or planning manager.',
			},
			delete: {
				name: 'Delete',
				action: 'Delete absence',
				description: 'Delete an employee absence by login and dates. Role: settings manager or planning manager.',
			},
		},
		release: {
			getMany: {
				name: 'Get Many',
				action: 'Get many releases',
				description: 'Project releases: status, dates, freeze, issue list, role representatives',
			},
			createOrUpdate: {
				name: 'Create or Update',
				action: 'Create or update release',
				description: 'Create a release or change an existing one by ID (the other fields are kept). Role: release manager.',
			},
			setStatus: {
				name: 'Set Status',
				action: 'Set release status',
				description:
					'Move a release along the chain planned → prep → work → released; cancelled — cancellation. A release engineer — only to the next step. Role: release manager or release engineer.',
			},
			updateIssues: {
				name: 'Update Issues',
				action: 'Add and remove release issues',
				description: 'Add and/or remove release issues in one step. Role: release manager.',
			},
			delete: {
				name: 'Delete',
				action: 'Delete release',
				description: 'Delete one release from the registry; irreversible. Requires planner 3.51.0 or later. Role: release manager.',
			},
		},
		reminder: {
			getMany: {
				name: 'Get Many',
				action: 'Get many reminders',
				description: "Active reminders for the token's user; the project journal — by option",
			},
		},
		access: {
			getMyRoles: {
				name: 'Get My Roles',
				action: 'Get my roles in project',
				description:
					"The token user's roles by planner groups. Roles are membership in planner groups, not permission for an operation. Requires planner 3.51.0 or later.",
			},
		},
		issue: {
			search: {
				name: 'Search',
				action: 'Search issues',
				description: 'YouTrack issues by a query in the YouTrack search syntax',
			},
			setField: {
				name: 'Set Field',
				action: 'Set issue field',
				description: "Write one issue field value through the standard YouTrack REST with the token user's permissions",
			},
			setFieldViaPlanner: {
				name: 'Set Field via Planner',
				action: 'Set issue field via planner',
				description:
					'Write an issue field through the planner: only fields from the planner settings and only with a planner role (assigner, editor, settings manager, release manager or release engineer)',
			},
		},
	},
	modes: {
		list: 'From List',
		listPlaceholder: 'Select…',
		key: 'By Key',
		keyPlaceholder: 'e.g. DEMO',
		id: 'By ID',
		idPlaceholder: 'e.g. R-2026-10',
	},
	collections: {
		options: 'Options',
		optionsPlaceholder: 'Add Option',
		additional: 'Additional Fields',
		additionalPlaceholder: 'Add Field',
		update: 'Update Fields',
		role: 'Role',
		roleValue: 'Role and Value',
		entry: 'Entry',
	},
	fields: {
		project: { displayName: 'Project', description: 'YouTrack project with the planner attached' },
		roleKey: { displayName: 'Role', description: 'Planning role' },
		issueId: { displayName: 'Issue ID', description: 'Readable YouTrack issue ID', placeholder: 'e.g. DEMO-101' },
		release: { displayName: 'Release', description: 'Project release' },
		releaseId: { displayName: 'Release ID', description: 'Release identifier, up to 64 characters', placeholder: 'e.g. R-2026-10' },
		sprintId: {
			displayName: 'Sprint ID',
			description: 'Stable sprint identifier (deduplication key in history)',
			placeholder: 'e.g. sprint-2026-11',
		},
		sprintIdFilter: { displayName: 'Sprint ID', description: 'Only records of this sprint (role records of the form <ID>_<role> match too)' },
		sprintIdDefault: { displayName: 'Sprint ID', description: 'Empty — the working slot sprint' },
		name: { displayName: 'Name', description: 'Sprint name' },
		releaseName: { displayName: 'Name', description: 'Release name' },
		dateStart: { displayName: 'Start Date', description: 'Sprint start' },
		dateEnd: { displayName: 'End Date', description: 'Sprint end' },
		items: {
			displayName: 'Items',
			description:
				'Issues by role, JSON: { "analysis": [ { "issueId": "DEMO-101", "inclusionStatus": "INC_PLANNED", "estimate": 480 } ] }. Only active project roles; estimates in minutes.',
		},
		sprintGoal: { displayName: 'Goal', description: 'Sprint goal' },
		roles: { displayName: 'Roles', description: 'Roles taking part in the sprint; empty — all active project roles' },
		sprintFieldVal: { displayName: 'Sprint Field Value', description: 'Value of the YouTrack "Sprint" field the sprint is bound to' },
		versionFieldVal: { displayName: 'Version Field Value', description: 'Value of the version or release field, if the project uses one' },
		resources: { displayName: 'Role Resources', description: 'Available role resource. ' + minutesHint },
		resourceMinutes: { displayName: 'Resource (Minutes)', description: minutesHint },
		title: { displayName: 'Issue Title', description: 'Empty — the planner fills it from YouTrack' },
		inclusionStatus: { displayName: 'Inclusion Status', description: 'An excluded issue needs an exclusion reason' },
		estimate: { displayName: 'Estimate (Minutes)', description: minutesHint },
		fact: { displayName: 'Actual (Minutes)', description: minutesHint },
		alloc: { displayName: 'Allocation (Minutes)', description: 'Time reserved for the role. ' + minutesHint },
		excludeReason: { displayName: 'Exclusion Reason', description: 'Required for the status "Excluded"' },
		assignee: { displayName: 'Assignee', description: 'Assignee login; to assign people, the "Assign" operation is handier' },
		assignLogin: { displayName: 'Assignee', description: 'Assignee login; empty — unassign the issue' },
		externalTicketId: { displayName: 'External Ticket ID', description: 'Ticket number in an external system' },
		workStart: { displayName: 'Work Start', description: 'Start of work on the issue' },
		workEnd: { displayName: 'Work End', description: 'End of work on the issue' },
		login: { displayName: 'Login', description: 'Employee login in YouTrack' },
		loginFilter: { displayName: 'Login', description: 'Only one employee' },
		grade: { displayName: 'Grade', description: 'Participant grade (a string from the project settings)' },
		rate: { displayName: 'Rate', description: 'Rate from 0 to 1' },
		participation: { displayName: 'Participation', description: 'Participation share from 0 to 1' },
		allocation: { displayName: 'Allocation by Role', description: "Participant's share in the role from 0 to 1" },
		share: { displayName: 'Share', description: 'From 0 to 1' },
		from: { displayName: 'From', description: 'First day of absence (calendar date)' },
		to: { displayName: 'To', description: 'Last day of absence (calendar date); a single day — equals "From"' },
		absenceType: { displayName: 'Type', description: 'Absence type' },
		hoursDelta: { displayName: 'Hours per Day', description: 'Partial absence — hours in each day (0.5–24); empty — full day' },
		periodFrom: { displayName: 'Period From', description: 'Only absences overlapping the period' },
		periodTo: { displayName: 'Period To', description: 'Only absences overlapping the period' },
		kind: { displayName: 'Kind', description: 'Release kind' },
		source: { displayName: 'Source', description: 'Release source' },
		releaseStatus: { displayName: 'Status', description: 'Release status' },
		releaseStatusFilter: { displayName: 'Status', description: 'Only releases in this status' },
		plannedDate: { displayName: 'Planned Date', description: 'Planned release date' },
		freezeDate: { displayName: 'Freeze Date', description: 'Scope freeze date' },
		freezeLocked: { displayName: 'Scope Frozen', description: 'Whether to freeze the release scope' },
		patchNote: { displayName: 'Patch Note', description: 'Patch description text' },
		notes: { displayName: 'Notes', description: 'Release notes' },
		taskUrl: { displayName: 'Task URL', description: 'Link to the release task' },
		roleReps: { displayName: 'Role Representatives', description: 'Login of the role representative in the release' },
		repLogin: { displayName: 'Login', description: 'Representative login' },
		snapshot: { displayName: 'Closing Snapshot', description: 'JSON — only together with the status released' },
		issuesToAdd: { displayName: 'Issues to Add', description: 'Comma-separated issue IDs or an array from an expression' },
		issuesToRemove: { displayName: 'Issues to Remove', description: 'Comma-separated issue IDs or an array from an expression' },
		includeExcluded: { displayName: 'Include Excluded', description: 'Whether to show excluded issues' },
		includeSettings: { displayName: 'Include Settings', description: 'Whether to attach the full project settings (a large object)' },
		limitPerRole: { displayName: 'Limit per Role', description: 'Max number of issues per role to return' },
		splitIntoItems: { displayName: 'Split Into Items', description: 'Whether to return one item per issue instead of one item per sprint' },
		sprintStatus: { displayName: 'Sprint Status', description: 'Only records in this status' },
		includeItems: { displayName: 'Include Items', description: "Whether to attach the records' issues (only together with a sprint ID)" },
		includeArchive: { displayName: 'Include Archive', description: 'Whether to attach the archive' },
		year: { displayName: 'Year', description: 'Only one calendar year, e.g. 2026' },
		includeJournal: { displayName: 'Include Journal', description: 'Whether to attach the project reminders journal' },
		overwrite: {
			displayName: 'Overwrite',
			description: "Whether to write over an occupied slot (someone else's draft or a sprint in progress). By default the upload is refused.",
		},
		revision: {
			displayName: 'Revision',
			description:
				'Data revision for optimistic locking. Without it the node reads the current one and retries the write once on a conflict; with it a conflict returns the refusal rev_conflict.',
		},
		output: { displayName: 'Output', description: "Simplified — compact fields; raw — the planner's response as is" },
		returnAll: { displayName: 'Return All', description: 'Whether to return all results or only up to a given limit' },
		limit: { displayName: 'Limit', description: 'Max number of results to return' },
		onlyWithPlanner: { displayName: 'Only With Planner', description: 'Whether to keep only projects with the planner attached' },
		search: { displayName: 'Search', description: 'Substring of the project name or key' },
		includeArchived: { displayName: 'Include Archived', description: 'Whether to show archived projects' },
		query: { displayName: 'Query', description: 'Query in the YouTrack search syntax', placeholder: 'e.g. #Unresolved sort by: updated' },
		searchProject: { displayName: 'Project', description: 'Project key — prepended to the query' },
		field: { displayName: 'Field', description: 'Issue field of the project; for an expression — a value of the form <id>|<type>' },
		value: { displayName: 'Value', description: 'Value name from the set, login, minutes, text, number or date YYYY-MM-DD — by field type' },
		clearField: { displayName: 'Clear Field', description: 'Whether to clear the field instead of writing a value' },
		fieldName: { displayName: 'Field Name', description: 'Issue field name — one of the fields assigned to the planner in the project settings' },
		fieldType: { displayName: 'Field Type', description: 'How to read the value: minutes, login or value name from the set' },
		plannerValue: { displayName: 'Value', description: 'Value name from the set, login or minutes — by field type' },
	},
	options: {
		output: { simplified: 'Simplified', raw: 'Raw' },
		inclusionStatus: {
			INC_PENDING: 'Undecided',
			INC_PLANNED: 'Planned',
			INC_UNPLANNED: 'Unplanned',
			INC_EXCLUDED: 'Excluded',
		},
		sprintStatus: { PLANNING: 'Planning', CONFIRMED: 'Confirmed', ALLOCATED: 'Allocated', FINISHED: 'Finished' },
		absenceType: {
			vacation: 'Vacation',
			sick: 'Sick Leave',
			out_of_membership: 'Out of Membership',
			regional_holiday: 'Regional Holiday',
			training: 'Training',
			teamleading: 'Team Leading',
			other: 'Other',
		},
		releaseStatus: { planned: 'Planned', prep: 'Preparation', work: 'In Progress', released: 'Released', cancelled: 'Cancelled' },
		releaseKind: { release: 'Release', hotfix: 'Hotfix' },
		releaseSource: { internal: 'Internal', vendor: 'Vendor' },
		fieldType: {
			enum: 'Value From Set (enum)',
			state: 'State (state)',
			version: 'Version (version)',
			owned: 'Subsystem (owned)',
			build: 'Build (build)',
			user: 'User (user)',
			period: 'Period, Minutes (period)',
		},
	},
	lists: {
		multiValue: '(multi-value — not supported)',
		selectProject: 'Select the project from the list or enter its key first',
	},
	errors: {
		refusal: '{meaning} ({reason})',
		refusalNoHint: 'The planner declined the request ({reason})',
		cid: 'cid: {cid}',
		revConflict: 'current revision {rev}',
		details: 'details: {errors}',
		token: 'YouTrack did not accept the token',
		tokenHint: 'Check the permanent token in the credentials',
		requires: 'Requires planner {version} or later',
		notAvailable: 'The planner is not available in project {projectKey}',
		notAvailableAny: 'The planner is not available',
		notAvailableHint: 'Check that the app is attached to the project and the Application ID field in the credentials',
		status: 'YouTrack responded with status {status}',
		network: 'YouTrack is unreachable: {url}',
		timeout: 'YouTrack did not respond within 30 s: {url}',
	},
	guards: {
		slot_occupied: {
			message: 'The working slot is occupied: sprint {sprintId} in status {status} (revision {rev})',
			hint: 'The upload was refused so as not to overwrite someone else\'s work. To write over it, turn on "Overwrite"; to edit the current sprint, use point operations.',
		},
		role_not_active: {
			message: 'Role {roleKey} is not planned in the project',
			hint: 'Active roles: {activeRoles}. Fill only those.',
		},
		nothing_to_do: {
			message: 'The request contains no changes',
			hint: 'Fill at least one field.',
		},
		sprint_not_found: {
			message: 'There is no sprint in the working slot',
			hint: 'Set the sprint ID explicitly or create a sprint.',
		},
		multi_value_field: {
			message: 'Multi-value fields are not supported in this version: {field}',
			hint: 'Use a command of the YouTrack node or the "Set Field via Planner" operation.',
		},
		field_not_in_issue: {
			message: "Field not found in the project of issue {issueId}",
			hint: "Select a field of this issue's project.",
		},
		invalid_field: {
			message: 'Field "{field}": {problem}',
			hint: 'Correct the field value and retry.',
		},
	},
	problems: {
		required: 'a value is required',
		tooLong: 'at most {max} characters',
		integer: 'an integer from {min} to {max} is required',
		number: 'a number from {min} to {max} is required',
		issueId: 'an issue ID like DEMO-101 is required',
		date: 'a date is required',
		json: 'valid JSON is required',
		role: 'unknown role {role}',
		oneOf: 'one of: {values}',
		item: 'issue {issueId}: {problem}',
		itemShape: 'an issue object is required',
		itemsShape: 'an object { "<role>": [ { "issueId": "DEMO-101", … } ] } is required, at most 1000 issues per role',
		unknownKey: 'unknown key {key}',
		unsupportedType: 'field type {type} is not supported',
		fieldValue: 'a value of the form <id>|<type> from the field list is required',
	},
};
