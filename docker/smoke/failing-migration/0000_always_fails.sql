-- Smoke-test fixture (docker/smoke.sh), never shipped in an image. Its timestamp in
-- meta/_journal.json is the year 2100, so it sorts after every real migration and runs as the
-- newest one in an upgrade. It divides by zero, so the migrator must roll it back, exit
-- non-zero and keep the container from starting.
SELECT 1 / 0;
