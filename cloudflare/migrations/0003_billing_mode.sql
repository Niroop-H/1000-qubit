-- Isolate TEST and LIVE accounts/charges using separate dedicated D1 databases.
-- Existing d25-license database is TEST. Fresh LIVE database requires deliberate
-- UPDATE d25_runtime_environment SET mode='live' WHERE id=1;
-- AFTER applying all migrations, before enabling any live checkout.
CREATE TABLE IF NOT EXISTS d25_runtime_environment (
 id INTEGER NOT NULL PRIMARY KEY CHECK(id=1),
 mode TEXT NOT NULL DEFAULT 'test' CHECK(mode IN ('test','live'))
);
INSERT OR IGNORE INTO d25_runtime_environment(id,mode) VALUES (1,'test');
