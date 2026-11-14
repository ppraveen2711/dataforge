# DataForge — Python & PySpark Learning Studio

A local learning website with **1,360 original multiple-choice questions**, **52 chapters**, chapter primers, exercises, explanations and official documentation links. The content moves from Python foundations through PySpark to practical data engineering.

## Start on Windows

1. Open this folder and double-click **Start DataForge.bat**.
2. Your browser opens **http://127.0.0.1:8765**.
3. Keep the terminal open while studying. Press **Ctrl+C** there to stop.

Requires **Python 3.11 or newer**. No pip packages, Java, Spark installation, account, API key or internet connection is needed to run the learning app. External documentation links need internet. Python/PySpark exercises run separately in your own coding environment; the website does not execute displayed code.

Alternative, from this folder:

```powershell
python server.py
```

If the port is already occupied:

```powershell
python server.py --port 8766
```

For macOS/Linux, use `python3 server.py`. Open the printed URL if your browser does not open automatically. Opening `static/index.html` directly is insufficient: the Python server provides the database and test engine.

## Start learning from the beginning

1. Open **Learning path → Python → Chapter 1**. Read the primer and try its small exercise.
2. Choose **Practice this chapter**, **10 questions**, **Beginner**, and **0 minutes** for untimed practice.
3. Choose an answer, then **Check answer**. Read the explanation even when you are right. A checked practice answer is locked.
4. Finish the session. Review your misses and open the linked documentation.
5. The next day, practice **My latest mistakes**, then continue the chapter.
6. Once comfortable, take a **Timed exam** with 20–30 questions. Explain your reasoning aloud before selecting answers.

The full sequence is 12 Python chapters, 12 PySpark chapters, and 10 data engineering chapters. Most contain 30 questions; the streaming primer contains 11 and the diagnostics chapter contains 29 after duplicate removal. MCQs train recall and reasoning; completing the exercises and building real pipelines is essential interview preparation.

## Features

- Configure question count (up to the matching pool), duration (0–240 minutes), chapters, track, difficulty and question pool.
- Practice with immediate explanations, or timed exams with feedback after submission.
- Stratified random question selection across chapters, without repeated questions within a session.
- Answer order changes for every question on its next new session; scoring uses stable choice IDs.
- Saves answers, position, flags and checks after every action. Reload or restart the server to resume.
- A timed session uses a persisted server deadline. Closing a tab does not pause it; expired sessions are finalized on the next server interaction.
- Unanswered questions count as missed; there is no negative marking.
- Bookmark questions, revisit mistakes, track chapter progress and inspect the latest 100 session summaries. All sessions remain in SQLite.
- Searchable, paginated question library with revealable explanations.
- Validated, atomic JSON imports; revision-aware updates; JSON exports and complete SQLite backups.
- Responsive desktop/mobile layout, keyboard answer shortcuts, focus indicators and reduced-motion support.

Only one active session is allowed at a time. Submit it before starting another. Progress uses the latest graded answer per question; practice checks count immediately. It is a learning aid, not an interview-readiness certificate.

## Content and sources

Questions are original educational questions informed by official documentation, not verbatim copies of commercial interview banks or leaked employer questions. They are a broad curriculum, not an exhaustive list of every possible interview question. Every question contains an explanation, source URL, difficulty, type and version assumption.

- Python baseline: **Python 3.11**, with version-independent behavior where possible.
- PySpark baseline: **Apache Spark 3.5.7**. Newer Spark releases can have different defaults; do not silently assume Spark 4.x behavior.
- Official references include the [Python tutorial](https://docs.python.org/3.11/tutorial/), [standard library](https://docs.python.org/3.11/library/), [PySpark API reference](https://spark.apache.org/docs/3.5.7/api/python/), [Spark performance guide](https://spark.apache.org/docs/3.5.7/sql-performance-tuning.html), and [Structured Streaming guide](https://spark.apache.org/docs/3.5.7/structured-streaming-programming-guide.html).
- `SOURCES.json` records the research references; `CONTENT_REPORT.json` records the bank inventory and structural checks.
- Documentation belongs to its respective authors. Question wording and lessons are original. Technical content can still benefit from expert review as software changes.

## Upgrade the question database

Open **Manage question bank → Download example** for a minimal valid import. The full `bank.json` is the shipped content; the live database is initialized from it only on first launch. Editing `bank.json` after initialization does not automatically replace live questions.

Use the website to choose a JSON file, select **Validate & preview**, inspect counts, then **Merge question bank**. The import is all-or-nothing. Identical records are skipped. To update a question, retain its ID and increase its integer `revision`. Imports merge chapters/questions; they do not delete existing content. Reuse chapter IDs to update lesson text. Old attempts retain snapshots of the question and explanation that were used at the time.

Each import includes `schema_version: 1`, `bank_version`, `chapters`, and `questions`. All chapter IDs referenced by its questions must be included. See **QUESTION_BANK_FORMAT.md**.

Command-line alternatives:

```powershell
python manage.py validate new-questions.json
python manage.py import new-questions.json
python manage.py import new-questions.json --apply
python manage.py export exported-bank.json
python manage.py backup my-backup.sqlite3
```

The import command previews changes unless `--apply` is supplied. The website and CLI share the same validator. Maximum upload: 16 MB; maximum questions in one import: 20,000. The app never executes imported code, renders content as escaped text, and restricts source links to HTTPS.

## Backups and restore

**Export question bank** saves content only. **Back up everything** saves the entire SQLite database, including progress and history. Keep a separate backup periodically.

To restore:

1. Stop the server with Ctrl+C.
2. Run `python manage.py restore path/to/my-backup.sqlite3` from this folder.
3. Restart DataForge.

Restore checks database integrity and required tables, refuses an observed running server, and preserves the current database as `data/before-restore-<timestamp>.sqlite3` before replacement. Restore is intended for trusted backups created by DataForge. Use one server process per database.

## Architecture and limits

- Python standard-library HTTP server bound to **127.0.0.1 only**.
- SQLite WAL storage; parameterized SQL, atomic transactions, serialized writes and stored attempt snapshots.
- Server-side grading and deadlines, secure random sampling, stable answer IDs and explicit import validation.
- Same-origin checks, per-process CSRF token, CSP and text escaping.
- Buildless HTML/CSS/JavaScript frontend; no CDN, tracking, third-party scripts or remote storage.

This is a **single-user local application**, not an internet-facing service. It has no multi-user authentication, remote administration, proctoring, cloud sync or automatic online content scraper. Production hosting would require a proper application server, identity model, deployment monitoring and multi-user isolation. The database is local and is not encrypted by this application. A local user can inspect/export answer keys, as expected for a study tool.

## Development and validation

```powershell
python -m unittest discover -s tests -v
python manage.py validate bank.json
node --check static/app.js
```

Node is needed only for the optional JavaScript syntax check, not for running the app. Backend tests cover shuffled-answer scoring, deadline expiry, resume state, practice locking, concurrent submission, filter pools, import atomicity/revisions, snapshot preservation, local-origin/CSRF checks and valid backups. Test databases use temporary directories; your learning data is not changed.

Directory layout:

```text
server.py                  Local HTTP API and quiz engine
manage.py                  Database/content maintenance commands
bank.json                  Shipped question bank (1,360 questions)
SOURCES.json               Reference catalog
CONTENT_REPORT.json        Inventory and validation summary
QUESTION_BANK_FORMAT.md    Import schema and upgrade rules
Start DataForge.bat        Windows launcher
static/                    Frontend and sample import
tests/                     Backend integration tests
data/                      Created at runtime; database and local state
```
