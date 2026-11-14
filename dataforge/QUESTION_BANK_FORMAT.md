# Question bank format — schema version 1

Imports are UTF-8 JSON objects. Download `static/import-example.json` for a complete example. For updates, export the current bank, edit selected records, increase their revisions and import the edited file.

| Field | Type | Meaning |
|---|---|---|
| schema_version | integer | Must equal 1 |
| bank_version | string | Human-readable content version, e.g. 1.1.0 |
| chapters | array | 1–200 chapter objects |
| questions | array | 1–20,000 question objects |

Chapter fields:

| Field | Meaning |
|---|---|
| id | Stable letters/numbers/underscore/hyphen ID, at most 80 characters |
| track | A nonempty track name, at most 80 characters. Built-in content uses Python, NumPy, pandas, PySpark and Data Engineering. New track names appear automatically in the UI. |
| title | Chapter title |
| order | Positive integer curriculum order |
| summary | Short introduction shown in the chapter list |
| lesson | Plain-text lesson primer, preserving line breaks |
| objectives | Array of 1–10 short learning objectives |
| exercise | Plain-text hands-on task |

Question fields:

| Field | Meaning |
|---|---|
| id | Stable unique ID; preserve it across revisions |
| chapter | ID of a chapter included in this import |
| difficulty | beginner, intermediate, or advanced |
| kind | concept, code, or scenario |
| prompt | Specific question with exactly one correct answer |
| code | Optional plain-text code block; no Markdown fences |
| choices | Exactly four distinct nonempty strings |
| answer | Zero-based integer index into choices: 0, 1, 2, or 3 |
| explanation | Why the correct choice works; address the likely misconception |
| source | Absolute HTTPS reference URL |
| version | Runtime/API baseline and relevant assumptions |
| revision | Positive integer; defaults to 1; increase when editing a question |

The displayed A/B/C/D positions are randomized independently of this answer index. Do not write explanations that say only “A is correct”; name the concept or actual answer instead. Avoid “all of the above,” multiple correct answers, unspecified Spark row ordering, and version-sensitive defaults without assumptions. Include plausible distractors and practical code or pipeline reasoning.

The validator rejects invalid records, duplicate IDs, repeated prompt/code combinations, repeated choices and changed question records without a higher revision. A prompt/code already belonging to another existing ID is also rejected. Validation is structural; it cannot prove the technical correctness of an answer. Review content against its source before adding it.

Choices are case-sensitive and preserve whitespace: `etl` and `ETL` can be different code results. When whitespace itself matters to the answer, put values in visible quotes or use an explicit representation so the distinction is clear to the learner.

Import behavior:

- New ID: add the question.
- Identical record: leave it unchanged.
- Existing ID with changed content: require a strictly higher revision.
- Existing chapter ID: replace its metadata/lesson with the imported chapter.
- Omitted records: retain them.
- Any invalid record: abort the entire import.
- Existing sessions and results: retain their original snapshots.

Source catalogs are supplementary documentation; per-question `source` links are the source of truth and are preserved in exports. Unknown extra fields are discarded by normalization. The bank export is suitable for re-import; full progress restoration uses a SQLite backup instead.
