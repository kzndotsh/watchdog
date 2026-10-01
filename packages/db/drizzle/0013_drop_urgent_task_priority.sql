-- "urgent" is no longer a task priority; fold existing rows into "high".
UPDATE "tasks" SET "priority" = 'high' WHERE "priority" = 'urgent';
