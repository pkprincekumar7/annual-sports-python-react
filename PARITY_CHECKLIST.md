## Verification status (Jan 22, 2026)

Legend:
- VERIFIED: behavior matches Node.js
- PYTHON-ONLY: endpoint added for service boundaries

Identity service
- VERIFIED: POST `/identities/login`
- VERIFIED: POST `/identities/reset-password`
- VERIFIED: POST `/identities/change-password`
- VERIFIED: GET `/identities/me`
- VERIFIED: GET `/identities/players`
- VERIFIED: POST `/identities/save-player`
- VERIFIED: PUT `/identities/update-player`
- VERIFIED: DELETE `/identities/delete-player/:reg_number`
- VERIFIED: POST `/identities/bulk-delete-players`
- VERIFIED: POST `/identities/bulk-player-enrollments`

Enrollment service
- VERIFIED: GET `/enrollments/batches`
- VERIFIED: POST `/enrollments/add-batch`
- VERIFIED: DELETE `/enrollments/remove-batch`
- PYTHON-ONLY: POST `/enrollments/batches/assign-player`
- PYTHON-ONLY: POST `/enrollments/batches/unassign-player`
- PYTHON-ONLY: POST `/enrollments/batches/unassign-players`

Department service
- VERIFIED: GET `/departments`
- VERIFIED: POST `/departments`
- VERIFIED: PUT `/departments/:id`
- VERIFIED: DELETE `/departments/:id`

Sports participation service
- VERIFIED: GET `/sports-participations/sports`
- VERIFIED: GET `/sports-participations/sports/:name`
- VERIFIED: POST `/sports-participations/sports`
- VERIFIED: PUT `/sports-participations/sports/:id`
- VERIFIED: DELETE `/sports-participations/sports/:id`
- VERIFIED: GET `/sports-participations/sports-counts`
- VERIFIED: POST `/sports-participations/add-coordinator`
- VERIFIED: DELETE `/sports-participations/remove-coordinator`
- VERIFIED: GET `/sports-participations/coordinators-by-sport`
- VERIFIED: POST `/sports-participations/add-captain`
- VERIFIED: DELETE `/sports-participations/remove-captain`
- VERIFIED: GET `/sports-participations/captains-by-sport`
- VERIFIED: POST `/sports-participations/update-team-participation`
- VERIFIED: GET `/sports-participations/teams/:sport`
- VERIFIED: POST `/sports-participations/update-team-player`
- VERIFIED: DELETE `/sports-participations/delete-team`
- VERIFIED: POST `/sports-participations/validate-participations`
- VERIFIED: GET `/sports-participations/participants/:sport`
- VERIFIED: GET `/sports-participations/participants-count/:sport`
- VERIFIED: POST `/sports-participations/update-participation`
- VERIFIED: DELETE `/sports-participations/remove-participation`
- VERIFIED: GET `/sports-participations/player-enrollments/:reg_number`

Event configuration service
- VERIFIED: GET `/event-configurations/event-years`
- VERIFIED: GET `/event-configurations/event-years/active`
- VERIFIED: POST `/event-configurations/event-years`
- VERIFIED: PUT `/event-configurations/event-years/:event_id`
- VERIFIED: DELETE `/event-configurations/event-years/:event_id`

Scheduling service
- VERIFIED: GET `/schedulings/event-schedule/:sport`
- VERIFIED: GET `/schedulings/event-schedule/:sport/teams-players`
- VERIFIED: POST `/schedulings/event-schedule`
- VERIFIED: PUT `/schedulings/event-schedule/:id`
- VERIFIED: DELETE `/schedulings/event-schedule/:id`

Scoring service
- VERIFIED: GET `/scorings/points-table/:sport`
- VERIFIED: POST `/scorings/points-table/backfill/:sport`
- PYTHON-ONLY: POST `/scorings/internal/points-table/update`

Reporting service
- VERIFIED: GET `/reportings/export-excel`

## Node vs Python parity checklist

Use this checklist to compare the Node.js monolith routes with the FastAPI
microservices. For each endpoint, verify method/path, auth/roles, date
restrictions, request validation, response shape, status codes, cache
invalidation, and side-effects.

Legend:
- Node route source: `routes/*.js`
- Python service source: `new-structure/<service>/app/routers/*.py`

### Identity service (Player + Auth)

#### POST /identities/login
- [ ] Node: `routes/auth.js` | Python: `identity-service/app/routers/auth.py`
- [ ] Auth: public (no token required)
- [ ] Date checks: none
- [ ] Request fields: `reg_number`, `password`
- [ ] Response shape: JWT + player object + `change_password_required`
- [ ] Computed fields included: `participated_in`, `captain_in`, `coordinator_in`, `batch_name`

#### POST /identities/reset-password
- [ ] Node: `routes/auth.js` | Python: `identity-service/app/routers/auth.py`
- [ ] Auth: public
- [ ] Date checks: none
- [ ] Request fields: `reg_number`, `email_id`
- [ ] Response: always success message (no user enumeration)
- [ ] Side effects: password reset + `change_password_required` set

#### POST /identities/change-password
- [ ] Node: `routes/auth.js` | Python: `identity-service/app/routers/auth.py`
- [ ] Auth: authenticated
- [ ] Date checks: none
- [ ] Validations: current password required, new password != current
- [ ] Response: success message, `change_password_required` cleared

#### GET /identities/me
- [ ] Node: `routes/players.js` | Python: `identity-service/app/routers/players.py`
- [ ] Auth: authenticated
- [ ] Date checks: none
- [ ] Event handling: optional `event_id` query (defaults to active)
- [ ] Response: `player` object with computed fields + batch name

#### GET /identities/players
- [ ] Node: `routes/players.js` | Python: `identity-service/app/routers/players.py`
- [ ] Auth: authenticated
- [ ] Date checks: none
- [ ] Event handling: optional `event_id` query (defaults to active)
- [ ] Search: `search` query (reg_number/full_name)
- [ ] Pagination: `page` and `limit` behavior matches Node
- [ ] Response: pagination metadata only when `page` provided

#### POST /identities/save-player
- [ ] Node: `routes/players.js` | Python: `identity-service/app/routers/players.py`
- [ ] Auth: public; registration period required
- [ ] Date checks: registration period + registration deadline check
- [ ] Required fields: `batch_name`, `event_id` (resolved via active event)
- [ ] Validations: department exists, unique reg_number, email format
- [ ] Side effects: assign to batch via Enrollment service
- [ ] Rollback: delete player if batch assignment fails
- [ ] Response shape/status codes match Node

#### PUT /identities/update-player
- [ ] Node: `routes/players.js` | Python: `identity-service/app/routers/players.py`
- [ ] Auth: admin + registration period
- [ ] Date checks: registration period + deadline check
- [ ] Validations: immutable fields, department validation
- [ ] Response shape/status codes match Node

#### DELETE /identities/delete-player/:reg_number
- [ ] Node: `routes/players.js` | Python: `identity-service/app/routers/players.py`
- [ ] Auth: admin + registration period
- [ ] Date checks: registration period + deadline check
- [ ] Side effects: unassign from batches + remove enrollments
- [ ] Response shape/status codes match Node

#### POST /identities/bulk-delete-players
- [ ] Node: `routes/players.js` | Python: `identity-service/app/routers/players.py`
- [ ] Auth: admin + registration period
- [ ] Date checks: registration period + deadline check
- [ ] Validations: cannot include admin reg number
- [ ] Side effects: unassign from batches
- [ ] Response shape/status codes match Node

#### POST /identities/bulk-player-enrollments
- [ ] Node: `routes/players.js` | Python: `identity-service/app/routers/players.py`
- [ ] Auth: admin
- [ ] Date checks: registration deadline check only
- [ ] Response: enrollments + match metadata
- [ ] Response shape/status codes match Node

#### GET /sports-participations/player-enrollments/:reg_number
- [ ] Node: `routes/players.js` | Python: `sports-participation-service/app/routers/participants.py`
- [ ] Auth: admin
- [ ] Date checks: none
- [ ] Response: non-team events, teams, matches, flags

### Enrollment service (Batches)

#### GET /enrollments/batches
- [ ] Node: `routes/batches.js` | Python: `enrollment-service/app/routers/batches.py`
- [ ] Auth: public
- [ ] Date checks: none
- [ ] Event handling: optional `event_id` query
- [ ] Response: includes `players` array

#### POST /enrollments/add-batch
- [ ] Node: `routes/batches.js` | Python: `enrollment-service/app/routers/batches.py`
- [ ] Auth: admin + registration period
- [ ] Date checks: registration period + deadline check
- [ ] Required fields: `event_id`, `name`
- [ ] Validations: unique batch name per event
- [ ] Response shape/status codes match Node

#### DELETE /enrollments/remove-batch
- [ ] Node: `routes/batches.js` | Python: `enrollment-service/app/routers/batches.py`
- [ ] Auth: admin + registration period
- [ ] Date checks: registration period + deadline check
- [ ] Validations: no players assigned
- [ ] Response shape/status codes match Node

#### POST /enrollments/batches/assign-player
- [ ] Node: `routes/batches.js` | Python: `enrollment-service/app/routers/batches.py`
- [ ] Auth: registration period only (no auth middleware by design)
- [ ] Date checks: registration period + deadline check
- [ ] Required fields: `event_id`, `name`, `reg_number`
- [ ] Response: updated batch, success message

#### POST /enrollments/batches/unassign-player
- [ ] Node: `routes/batches.js` | Python: `enrollment-service/app/routers/batches.py`
- [ ] Auth: registration period only
- [ ] Date checks: registration period + deadline check
- [ ] Required fields: `event_id`, `name`, `reg_number`
- [ ] Response: updated batch, success message

#### POST /enrollments/batches/unassign-players
- [ ] Node: `routes/batches.js` | Python: `enrollment-service/app/routers/batches.py`
- [ ] Auth: registration period only
- [ ] Date checks: registration period + deadline check
- [ ] Required fields: `event_id`, `reg_numbers`
- [ ] Response: updated batch, success message

### Organization service (Departments)

#### GET /departments
- [ ] Node: `routes/departments.js` | Python: `department-service/app/routers/departments.py`
- [ ] Auth: public
- [ ] Date checks: none
- [ ] Response: includes `player_count` per department

#### POST /departments
- [ ] Node: `routes/departments.js` | Python: `department-service/app/routers/departments.py`
- [ ] Auth: admin
- [ ] Date checks: none (departments exempt)
- [ ] Validations: unique name, reject createdBy/updatedBy
- [ ] Response shape/status codes match Node

#### PUT /departments/:id
- [ ] Node: `routes/departments.js` | Python: `department-service/app/routers/departments.py`
- [ ] Auth: admin
- [ ] Date checks: none
- [ ] Validations: only `display_order` mutable
- [ ] Response shape/status codes match Node

#### DELETE /departments/:id
- [ ] Node: `routes/departments.js` | Python: `department-service/app/routers/departments.py`
- [ ] Auth: admin
- [ ] Date checks: none
- [ ] Validations: block if players exist
- [ ] Response shape/status codes match Node

### Sports participation service (Sports + Captains + Coordinators + Teams + Participants)

#### GET /sports-participations/sports
- [ ] Node: `routes/sports.js` | Python: `sports-participation-service/app/routers/sports.py`
- [ ] Auth: public
- [ ] Date checks: none
- [ ] Event handling: optional `event_id` query
- [ ] Response: array (empty if event not found)

#### GET /sports-participations/sports/:name
- [ ] Node: `routes/sports.js` | Python: `sports-participation-service/app/routers/sports.py`
- [ ] Auth: public
- [ ] Date checks: none
- [ ] Event handling: optional `event_id` query (defaults active)
- [ ] Response: 404 if not found

#### GET /sports-participations/sports-counts
- [ ] Node: `routes/sports.js` | Python: `sports-participation-service/app/routers/sports.py`
- [ ] Auth: authenticated
- [ ] Date checks: none
- [ ] Event handling: optional `event_id` query (defaults active)
- [ ] Response: teams_counts + participants_counts

#### POST /sports-participations/sports
- [ ] Node: `routes/sports.js` | Python: `sports-participation-service/app/routers/sports.py`
- [ ] Auth: admin + registration period
- [ ] Date checks: registration period + deadline check
- [ ] Required fields: `event_id`, `name`, `type`, `category`
- [ ] Validations: team_size rules

#### PUT /sports-participations/sports/:id
- [ ] Node: `routes/sports.js` | Python: `sports-participation-service/app/routers/sports.py`
- [ ] Auth: admin + registration period
- [ ] Date checks: registration period + deadline check
- [ ] Event handling: optional `event_id` query (validate ownership)
- [ ] Validations: cannot change event_id, team_size logic

#### DELETE /sports-participations/sports/:id
- [ ] Node: `routes/sports.js` | Python: `sports-participation-service/app/routers/sports.py`
- [ ] Auth: admin + registration period
- [ ] Date checks: registration period + deadline check
- [ ] Validations: no teams/players/matches/points

#### POST /sports-participations/add-coordinator
- [ ] Node: `routes/coordinators.js` | Python: `sports-participation-service/app/routers/coordinators.py`
- [ ] Auth: admin + registration period
- [ ] Date checks: registration period + deadline check
- [ ] Validations: cannot be participant/captain

#### DELETE /sports-participations/remove-coordinator
- [ ] Node: `routes/coordinators.js` | Python: `sports-participation-service/app/routers/coordinators.py`
- [ ] Auth: admin + registration period
- [ ] Date checks: registration period + deadline check

#### GET /sports-participations/coordinators-by-sport
- [ ] Node: `routes/coordinators.js` | Python: `sports-participation-service/app/routers/coordinators.py`
- [ ] Auth: admin
- [ ] Date checks: none
- [ ] Response: map of sport -> coordinators (with participation fields)

#### POST /sports-participations/add-captain
- [ ] Node: `routes/captains.js` | Python: `sports-participation-service/app/routers/captains.py`
- [ ] Auth: admin or assigned coordinator + registration period
- [ ] Date checks: registration period + deadline check
- [ ] Validations: team sport only, not coordinator, not already captain

#### DELETE /sports-participations/remove-captain
- [ ] Node: `routes/captains.js` | Python: `sports-participation-service/app/routers/captains.py`
- [ ] Auth: admin or assigned coordinator + registration period
- [ ] Date checks: registration period + deadline check
- [ ] Validations: cannot remove if team already created

#### GET /sports-participations/captains-by-sport
- [ ] Node: `routes/captains.js` | Python: `sports-participation-service/app/routers/captains.py`
- [ ] Auth: admin or assigned coordinator
- [ ] Date checks: none
- [ ] Response: map of sport -> captains (with participation fields)

#### POST /sports-participations/update-team-participation
- [ ] Node: `routes/teams.js` | Python: `sports-participation-service/app/routers/teams.py`
- [ ] Auth: captain (assigned sport) + registration period
- [ ] Date checks: registration period + deadline check
- [ ] Validations: batch match, gender match, team size, single captain

#### GET /sports-participations/teams/:sport
- [ ] Node: `routes/teams.js` | Python: `sports-participation-service/app/routers/teams.py`
- [ ] Auth: authenticated
- [ ] Date checks: none
- [ ] Response: populated players with batch names

#### POST /sports-participations/update-team-player
- [ ] Node: `routes/teams.js` | Python: `sports-participation-service/app/routers/teams.py`
- [ ] Auth: admin/coordinator + registration period
- [ ] Date checks: registration period + deadline check
- [ ] Validations: captain immutability, batch/gender checks

#### DELETE /sports-participations/delete-team
- [ ] Node: `routes/teams.js` | Python: `sports-participation-service/app/routers/teams.py`
- [ ] Auth: admin/coordinator + registration period
- [ ] Date checks: registration period + deadline check
- [ ] Validations: no match history

#### POST /sports-participations/validate-participations
- [ ] Node: `routes/teams.js` | Python: `sports-participation-service/app/routers/teams.py`
- [ ] Auth: authenticated
- [ ] Date checks: deadline check only
- [ ] Validations: no existing team membership

#### GET /sports-participations/participants/:sport
- [ ] Node: `routes/participants.js` | Python: `sports-participation-service/app/routers/participants.py`
- [ ] Auth: admin/coordinator (assigned sport)
- [ ] Date checks: none
- [ ] Response: sorted by name, includes count

#### GET /sports-participations/participants-count/:sport
- [ ] Node: `routes/participants.js` | Python: `sports-participation-service/app/routers/participants.py`
- [ ] Auth: authenticated
- [ ] Date checks: none

#### POST /sports-participations/update-participation
- [ ] Node: `routes/participants.js` | Python: `sports-participation-service/app/routers/participants.py`
- [ ] Auth: self or admin/coordinator + registration period
- [ ] Date checks: registration period + deadline check
- [ ] Validations: sport type, coordinator exclusion

#### DELETE /sports-participations/remove-participation
- [ ] Node: `routes/participants.js` | Python: `sports-participation-service/app/routers/participants.py`
- [ ] Auth: admin/coordinator + registration period
- [ ] Date checks: registration period + deadline check
- [ ] Validations: no match history

#### GET /sports-participations/player-enrollments/:reg_number
- [ ] Node: `routes/players.js` | Python: `sports-participation-service/app/routers/participants.py`
- [ ] Auth: admin
- [ ] Date checks: none
- [ ] Response: nonTeamEvents, teams, matches, flags

### Event configuration service (Event years)

#### GET /event-configurations/event-years
- [ ] Node: `routes/eventYears.js` | Python: `event-configuration-service/app/routers/event_years.py`
- [ ] Auth: authenticated
- [ ] Date checks: none
- [ ] Response: `is_active` computed

#### GET /event-configurations/event-years/active
- [ ] Node: `routes/eventYears.js` | Python: `event-configuration-service/app/routers/event_years.py`
- [ ] Auth: public
- [ ] Date checks: none
- [ ] Response: `{ success, eventYear }`, `eventYear` can be null

#### POST /event-configurations/event-years
- [ ] Node: `routes/eventYears.js` | Python: `event-configuration-service/app/routers/event_years.py`
- [ ] Auth: admin
- [ ] Date checks: create allowed even when no active year
- [ ] Validations: date relationships + not in past

#### PUT /event-configurations/event-years/:event_id
- [ ] Node: `routes/eventYears.js` | Python: `event-configuration-service/app/routers/event_years.py`
- [ ] Auth: admin
- [ ] Date checks: allowed until registration end date
- [ ] Validations: date field restrictions
- [ ] Event ID behavior: remains stable after event name update

#### DELETE /event-configurations/event-years/:event_id
- [ ] Node: `routes/eventYears.js` | Python: `event-configuration-service/app/routers/event_years.py`
- [ ] Auth: admin
- [ ] Date checks: only before registration start date
- [ ] Validations: not active, no data exists

### Scheduling service (Event schedule)

#### GET /schedulings/event-schedule/:sport
- [ ] Node: `routes/eventSchedule.js` | Python: `scheduling-service/app/routers/event_schedule.py`
- [ ] Auth: authenticated
- [ ] Date checks: none
- [ ] Optional `gender` query filters derived gender

#### GET /schedulings/event-schedule/:sport/teams-players
- [ ] Node: `routes/eventSchedule.js` | Python: `scheduling-service/app/routers/event_schedule.py`
- [ ] Auth: admin/coordinator (assigned sport)
- [ ] Date checks: none
- [ ] Required `gender` query
- [ ] Validations: exclude knocked out + already scheduled

#### POST /schedulings/event-schedule
- [ ] Node: `routes/eventSchedule.js` | Python: `scheduling-service/app/routers/event_schedule.py`
- [ ] Auth: admin/coordinator (assigned sport)
- [ ] Date checks: event period + match date within event range
- [ ] Validations: match type rules, league/knockout/final sequencing
- [ ] Derived gender used for caching and validation

#### PUT /schedulings/event-schedule/:id
- [ ] Node: `routes/eventSchedule.js` | Python: `scheduling-service/app/routers/event_schedule.py`
- [ ] Auth: admin/coordinator (assigned sport)
- [ ] Date checks: event status update period
- [ ] Validations: winner/qualifiers, status transitions, date range
- [ ] Side effect: points table update via Scoring service

#### DELETE /schedulings/event-schedule/:id
- [ ] Node: `routes/eventSchedule.js` | Python: `scheduling-service/app/routers/event_schedule.py`
- [ ] Auth: admin/coordinator (assigned sport)
- [ ] Date checks: event period
- [ ] Validations: only scheduled matches can be deleted

### Scoring service (Points table)

#### GET /scorings/points-table/:sport
- [ ] Node: `routes/pointsTable.js` | Python: `scoring-service/app/routers/points_table.py`
- [ ] Auth: authenticated
- [ ] Date checks: none
- [ ] Required `gender` query parameter
- [ ] Response: includes `has_league_matches`

#### POST /scorings/points-table/backfill/:sport
- [ ] Node: `routes/pointsTable.js` | Python: `scoring-service/app/routers/points_table.py`
- [ ] Auth: admin/coordinator (assigned sport)
- [ ] Date checks: none
- [ ] Side effect: recompute from completed league matches

#### POST /scorings/internal/points-table/update
- [ ] Node: N/A | Python only: `scoring-service/app/routers/points_table.py`
- [ ] Auth: internal service auth
- [ ] Request fields: `match`, `previous_status`, `previous_winner`, `user_reg_number`

### Reporting service (Exports)

#### GET /reportings/export-excel
- [ ] Node: `routes/exports.js` | Python: `reporting-service/app/routers/export.py`
- [ ] Auth: admin
- [ ] Date checks: none
- [ ] Event handling: optional `event_id` query
- [ ] Response: Excel file with dynamic sport columns
