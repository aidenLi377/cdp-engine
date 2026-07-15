# Task Center User Isolation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every Task Center task private to its creator and migrate legacy tasks to the `admin` account.

**Architecture:** Add an internal `owner_id` column to SQLite tasks, require a user ID at every TaskStore boundary, and pass the authenticated Flask user into those calls. Keep the frontend API shape unchanged and use explicit migration tooling to claim unowned and JSON-backed legacy tasks.

**Tech Stack:** Python 3.14, Flask, SQLite, `unittest`, Vue 3/Vite frontend regression checks.

## Global Constraints

- Preserve all pre-existing uncommitted workspace changes; edit only the named files and do not stage implementation files automatically.
- Tasks are private only; no shared/public task mode is introduced.
- Cross-user access returns `TASK_NOT_FOUND` with HTTP 404.
- `owner_id` is never accepted from the client and never emitted in task API responses.
- Existing legacy tasks are assigned to username `admin`.
- Follow red-green-refactor: every behavior change starts with a test that fails for the intended reason.

---

### Task 1: Ownership-aware SQLite task store

**Files:**
- Create: `test_task_store.py`
- Modify: `cdp_backend/database.py`
- Modify: `cdp_backend/task_store.py`

**Interfaces:**
- Produces: `TaskStore.list_tasks(user_id)`, `get_task(task_id, user_id)`, `create_task(payload, user_id)`, `update_progress(task_id, payload, user_id)`, and `delete_task(task_id, user_id)`.
- Persists: `tasks.owner_id`; omits it from returned task dictionaries.

- [ ] **Step 1: Write failing store isolation tests**

Create `TaskStoreOwnershipTests` with a temporary database. Create Alice and Bob task records through the desired API and assert list/get/update/delete isolation. Include a forged `ownerId` and `owner_id` in Alice's payload and prove Bob still cannot retrieve it. Query SQLite directly to assert the stored owner is Alice.

- [ ] **Step 2: Run the store tests and verify RED**

Run:

```powershell
.\.venv\Scripts\python.exe -m unittest test_task_store.TaskStoreOwnershipTests -v
```

Expected: FAIL because TaskStore methods do not accept or enforce `user_id` and `tasks` has no `owner_id` column.

- [ ] **Step 3: Implement the minimum schema and store changes**

In `database.py`:

- Add `owner_id TEXT NOT NULL` to the fresh `tasks` DDL.
- Add `tasks.owner_id: TEXT` to `MIGRATION_COLUMNS` for existing databases.
- Add `idx_tasks_owner_created ON tasks(owner_id, created_at)`.

In `task_store.py`:

- Require `user_id` on all five public methods.
- Store only the method argument as `owner_id`, ignoring payload ownership keys.
- Add `owner_id = ?` to every select, update, and delete predicate.
- Strip `owner_id`, `ownerId`, and any unmapped internal ownership key from returned dictionaries.
- Raise `TaskNotFoundError` for a cross-user progress update and return `False` for a cross-user delete.

- [ ] **Step 4: Run the store tests and verify GREEN**

Run the Step 2 command. Expected: all store ownership tests pass.

---

### Task 2: Flask task API isolation

**Files:**
- Create: `test_task_isolation.py`
- Modify: `cdp_backend/app_factory.py`

**Interfaces:**
- Consumes: the ownership-aware TaskStore signatures from Task 1.
- Produces: unchanged `/api/tasks` HTTP contract with creator-only authorization.

- [ ] **Step 1: Write a failing two-user API test**

Create an isolated app with Alice and Bob accounts and independent Flask test clients. Assert:

- Alice and Bob can each create a task.
- Each list contains only its creator's task.
- Bob receives 404 when reading, updating, or deleting Alice's task.
- Alice can still read her task after Bob's failed operations.
- Forged owner fields in Alice's create request do not transfer ownership.

- [ ] **Step 2: Run the API test and verify RED**

Run:

```powershell
.\.venv\Scripts\python.exe -m unittest test_task_isolation.TaskIsolationApiTests -v
```

Expected: FAIL because the Flask task routes do not pass `g.current_user["id"]` to TaskStore.

- [ ] **Step 3: Pass the authenticated user through every task route**

Update create, list, get, delete, and progress routes to call TaskStore with `g.current_user["id"]`. Preserve existing validation and `TASK_NOT_FOUND` responses.

- [ ] **Step 4: Run API and store tests and verify GREEN**

Run:

```powershell
.\.venv\Scripts\python.exe -m unittest test_task_store test_task_isolation -v
```

Expected: all task ownership tests pass.

---

### Task 3: Explicit legacy-task ownership migration

**Files:**
- Create: `test_task_migration.py`
- Modify: `migrate_json_to_sqlite.py`

**Interfaces:**
- Produces: `migrate_tasks(owner_username: str = "admin") -> int`.
- Produces: CLI option `--task-owner`, defaulting to `admin`.

- [ ] **Step 1: Write failing migration tests**

Build a temporary legacy database whose `tasks` table predates `owner_id`, then run `init_db()` so the nullable compatibility column is added. Create `admin`, insert one unowned database task, and provide one JSON task through a patched temporary `RUNTIME_DIR`.

Assert that `migrate_tasks("admin")`:

- backfills the existing unowned task;
- inserts the JSON task with the same admin owner;
- returns the number of newly inserted JSON tasks;
- is idempotent on a second run;
- raises a clear `ValueError` if the requested owner username does not exist.

- [ ] **Step 2: Run the migration tests and verify RED**

Run:

```powershell
.\.venv\Scripts\python.exe -m unittest test_task_migration.TaskMigrationOwnershipTests -v
```

Expected: FAIL because `migrate_tasks` has no owner parameter and inserts no `owner_id`.

- [ ] **Step 3: Implement explicit migration ownership**

- Resolve the owner ID with a case-insensitive users query.
- Fail before writes when the username is missing.
- Backfill only `owner_id IS NULL`; never overwrite already-owned tasks.
- Include `owner_id` when inserting JSON tasks.
- Add `argparse` handling for `--task-owner` and pass it to `migrate_tasks`.

- [ ] **Step 4: Run migration and task tests and verify GREEN**

Run:

```powershell
.\.venv\Scripts\python.exe -m unittest test_task_store test_task_isolation test_task_migration -v
```

Expected: all task ownership and migration tests pass.

---

### Task 4: Full regression and local data migration

**Files:**
- Modify data only after backup: `.runtime/cdp.db`

**Interfaces:**
- Consumes: completed schema, API, store, and migration changes.
- Produces: current local database with any unowned/JSON legacy task assigned to `admin`.

- [ ] **Step 1: Run the full Python suite**

```powershell
.\.venv\Scripts\python.exe -m unittest discover -s . -p 'test*.py' -v
```

Expected: all Python tests pass.

- [ ] **Step 2: Run frontend and extension regression tests**

```powershell
$fe = Get-ChildItem -Recurse -File 'cdp-web/src' -Filter '*.test.mjs' | ForEach-Object FullName
node --test $fe
$ext = Get-ChildItem -File 'chrome-extension/databank-automation' -Filter '*.test.mjs' | ForEach-Object FullName
node --test $ext
```

Expected: 87 frontend tests and 4 extension tests pass, or higher if the workspace adds tests concurrently.

- [ ] **Step 3: Run the production frontend build**

```powershell
Push-Location cdp-web
npm run build
Pop-Location
```

Expected: type-check and Vite production build exit 0.

- [ ] **Step 4: Back up and migrate the current local database**

Copy `.runtime/cdp.db` to a timestamped `.runtime/backups/` file, verify both resolved paths remain inside `.runtime`, then run:

```powershell
.\.venv\Scripts\python.exe migrate_json_to_sqlite.py --task-owner admin
```

Verify via a read-only SQL query that every task has `owner_id` equal to the `admin` user's ID and that the legacy task count is preserved.

- [ ] **Step 5: Review the final diff**

Run `git diff --check` and inspect diffs only for the files listed in this plan. Do not stage or commit the implementation because the affected files contained pre-existing user changes before this task.
