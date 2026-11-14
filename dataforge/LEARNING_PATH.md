# A practical path toward data engineering depth

Use the application for deliberate practice and the chapter exercises for implementation. Work through the four tools from beginner to advanced; a high quiz score alone is not proof that you can design or debug a pipeline.

## 1. Python foundations

Begin with the first 12 Python chapters. Learn values and mutability, collections, control flow, functions, closures, generators, exceptions, classes, modules, typing and algorithmic costs.

For each chapter, read the primer, predict the output of code without executing it, try the exercise, then answer 10–20 unseen questions. Explain each missed answer in your own words and revisit it the following day.

**Readiness check:** Build a transformation that handles empty inputs, malformed records, missing values and duplicate keys. Write tests for these boundaries. Explain its time and memory cost.

## 2. NumPy: reason about shape and memory

Follow the NumPy chapters in order. Arrays differ from Python lists: dtype, shape, strides, views and broadcasting determine both results and resource use. Practice reductions along named axes and distinguish basic slicing from advanced indexing.

**Mini-project:** Compute daily sensor summaries from an array of readings. Mask invalid and nonfinite values, calculate per-sensor statistics, normalize valid measurements, and flag anomalies. Avoid allocating an unnecessary pairwise matrix.

**Acceptance criteria:** Verify shapes at every step; compare a small case to a clear Python implementation; explain which arrays share memory; test empty groups and invalid values; choose tolerances for floating-point comparisons deliberately.

## 3. pandas: reason about labels, keys and time

Learn Series/DataFrame construction, label alignment, selection, nullable dtypes, cleaning, groupby, joins, reshaping, time-series operations and chunked ingestion. The curriculum uses pandas 3.0: Copy-on-Write behavior must be considered when adapting older examples.

**Mini-project:** Build a sales reconciliation pipeline from orders, customers and refunds. Validate keys and amounts, quarantine malformed rows, join with explicit cardinality checks, and produce daily totals by region. Decide how missing keys and unmatched records should behave.

**Acceptance criteria:** Assert row counts around joins; reject unexpected key duplication; test null-key matching explicitly; keep currency calculations precise; test timezone boundaries and late refunds; prove aggregate totals reconcile to accepted inputs.

## 4. PySpark: reason about distributed execution

Complete the PySpark foundations before advanced optimization and streaming chapters. Learn schema contracts, expressions, nulls, aggregations, joins, windows, nested data, storage formats and Python execution boundaries. Predict partition movement before trying to tune it.

**Mini-project:** Port the pandas reconciliation job to PySpark. Compare results on the same small dataset, then inspect the physical plan and design a larger-data execution strategy.

**Acceptance criteria:** Compare results independently of row ordering; verify duplicate-key effects; explain every major shuffle; justify any broadcast or cache; avoid collecting unbounded data on the driver; test schema and null behavior with explicit assumptions.

## 5. Advanced engineering: design for bounded resources and replay

Return to the advanced Python and PySpark chapters, then the Data Engineering track. Focus on bounded-memory algorithms, task ownership, concurrency limits, cancellation, testing, query-plan diagnosis, skew, watermarks, replay and idempotency.

**Capstone:** Design an incremental event pipeline with duplicate and late arrivals, schema changes and a simulated mid-write failure. Choose batch or streaming based on latency requirements. Define ownership of checkpoints and how the sink avoids duplicate effects after retry.

**Acceptance criteria:** State the delivery guarantees precisely; demonstrate recovery; measure input/output counts and rejected rows; identify where state can grow; describe a backfill strategy; explain what changes if event keys, source guarantees or sink transaction support change.

## A repeatable study session

1. Read one chapter primer and reproduce a small example.
2. Answer 10–20 unseen questions at the current difficulty.
3. Review the explanations and official references.
4. Implement the chapter exercise and test edge cases.
5. Revisit the mistake pool later, then raise the difficulty.
6. Use mixed timed tests after you can explain and implement the material.

For interviews, answer in this order: clarify the input contract, state assumptions, choose an approach, explain correctness, estimate resource costs, describe failure handling, and propose tests. Practise defending two reasonable alternatives when the correct design depends on workload or guarantees.

## Runtime assumptions

The app itself uses only Python's standard library. pandas, NumPy, Spark and Java are not needed to browse lessons or take tests. Run exercises separately in an environment compatible with their stated versions. New examples target pandas 3.0 and NumPy 2.x; Python and Spark questions retain their explicit baselines. Always read the version and configuration assumptions before comparing behavior across releases.
