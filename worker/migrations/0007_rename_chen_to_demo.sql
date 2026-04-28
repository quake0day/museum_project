-- Rename the implicit single-tenant "chen" user to "demo" so anonymous
-- visitors land on a generic showcase account by default. Run once on
-- remote D1 in tandem with the wrangler.toml DEFAULT_USER_ID switch.

UPDATE interactions   SET user_id = 'demo' WHERE user_id = 'chen';
UPDATE wiki_pages     SET user_id = 'demo' WHERE user_id = 'chen';
UPDATE wiki_links     SET user_id = 'demo' WHERE user_id = 'chen';
UPDATE wiki_log       SET user_id = 'demo' WHERE user_id = 'chen';
UPDATE quest_status   SET user_id = 'demo' WHERE user_id = 'chen';
