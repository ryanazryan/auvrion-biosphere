-- READ ONLY: Inspect development sources and accounts BEFORE deployment.
-- Run against the DEVELOPMENT database, never assume this is safe to delete.
SELECT o.code AS organization, s.code AS source_code, s.label AS source_name,
       s.kind, s.is_active, count(obs.id) AS linked_observations
FROM observation_sources s
JOIN organizations o ON o.id=s.organization_id
LEFT JOIN observations obs ON obs.source_id=s.id
GROUP BY o.code,s.code,s.label,s.kind,s.is_active
ORDER BY o.code,s.code;

SELECT u.id, u.email, ua.status AS access_status,
       count(DISTINCT rg.id) FILTER (WHERE rg.revoked_at IS NULL) AS active_role_grants,
       count(DISTINCT ag.id) FILTER (WHERE ag.revoked_at IS NULL) AS active_admin_grants
FROM "user" u
LEFT JOIN user_access ua ON ua.user_id=u.id
LEFT JOIN role_grants rg ON rg.user_id=u.id
LEFT JOIN admin_capability_grants ag ON ag.user_id=u.id
GROUP BY u.id,u.email,ua.status
ORDER BY u.email;

SELECT ingestion_mode, domain, count(*) FROM observations
GROUP BY ingestion_mode, domain ORDER BY domain,ingestion_mode;
