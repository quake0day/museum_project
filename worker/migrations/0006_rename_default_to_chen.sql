-- Rename the implicit single-tenant "default" user to "chen". Run once on
-- remote D1 in tandem with the wrangler.toml DEFAULT_USER_ID switch.
--
-- All tables that carry user_id need the same UPDATE — interactions, the
-- wiki layer (pages/links/log), and per-user state tables (quest_status).

UPDATE interactions   SET user_id = 'chen' WHERE user_id = 'default';
UPDATE wiki_pages     SET user_id = 'chen' WHERE user_id = 'default';
UPDATE wiki_links     SET user_id = 'chen' WHERE user_id = 'default';
UPDATE wiki_log       SET user_id = 'chen' WHERE user_id = 'default';
UPDATE quest_status   SET user_id = 'chen' WHERE user_id = 'default';
