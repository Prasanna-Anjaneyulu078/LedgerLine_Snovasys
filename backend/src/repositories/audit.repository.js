import { pool } from '../config/database.js';

export class AuditRepository {
  /**
   * Insert audit event record
   */
  async create(
    { actorId = null, action, resourceType, resourceId = null, metadata = null, ipAddress = null },
    client = pool
  ) {
    const sql = `
      INSERT INTO audit_events (
        actor_id, action, resource_type, resource_id, metadata, ip_address
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id, actor_id, action, resource_type, resource_id, metadata, ip_address, created_at;
    `;
    const res = await client.query(sql, [
      actorId,
      action,
      resourceType,
      resourceId,
      metadata ? JSON.stringify(metadata) : null,
      ipAddress,
    ]);
    return res.rows[0];
  }

  /**
   * Find all audit events with pagination and filtering
   */
  async findAll(
    {
      limit = 15,
      offset = null,
      page = null,
      actorId = null,
      action = null,
      resourceType = null,
      status = null,
      startDate = null,
      endDate = null,
      search = null,
    } = {},
    client = pool
  ) {
    const pageNum = page ? Math.max(1, parseInt(page, 10) || 1) : null;
    const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10) || 15));
    const offsetNum = offset !== null && offset !== undefined
      ? Math.max(0, parseInt(offset, 10) || 0)
      : pageNum
      ? (pageNum - 1) * limitNum
      : 0;

    const conditions = [];
    const params = [];

    if (search && typeof search === 'string' && search.trim() !== '') {
      params.push(`%${search.trim()}%`);
      conditions.push(
        `(u.email ILIKE $${params.length} OR u.full_name ILIKE $${params.length} OR ae.action ILIKE $${params.length} OR ae.resource_type ILIKE $${params.length} OR ae.resource_id ILIKE $${params.length})`
      );
    }

    if (actorId) {
      params.push(actorId);
      conditions.push(`ae.actor_id = $${params.length}`);
    }

    if (action && action !== 'ALL' && typeof action === 'string' && action.trim() !== '') {
      params.push(action.trim());
      conditions.push(`ae.action = $${params.length}`);
    }

    if (resourceType) {
      params.push(resourceType);
      conditions.push(`ae.resource_type = $${params.length}`);
    }

    if (status && status !== 'ALL' && typeof status === 'string' && status.trim() !== '') {
      const s = status.trim().toUpperCase();
      if (s === 'FAILURE' || s === 'REFUSED') {
        conditions.push(`(ae.action ILIKE '%FAILURE%' OR ae.action ILIKE '%REFUSED%')`);
      } else if (s === 'SUCCESS') {
        conditions.push(`(ae.action NOT ILIKE '%FAILURE%' AND ae.action NOT ILIKE '%REFUSED%')`);
      }
    }

    if (startDate) {
      params.push(startDate);
      conditions.push(`ae.created_at >= $${params.length}`);
    }

    if (endDate) {
      const normalizedEndDate =
        typeof endDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(endDate.trim())
          ? `${endDate.trim()}T23:59:59.999Z`
          : endDate;
      params.push(normalizedEndDate);
      conditions.push(`ae.created_at <= $${params.length}`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countSql = `
      SELECT count(*) as total
      FROM audit_events ae
      LEFT JOIN users u ON ae.actor_id = u.id
      ${whereClause};
    `;
    const countRes = await client.query(countSql, params);
    const totalEvents = Number(countRes.rows[0]?.total || 0);

    const queryParams = [...params, limitNum, offsetNum];
    const sql = `
      SELECT ae.id, ae.actor_id, ae.action, ae.resource_type, ae.resource_id,
             ae.metadata, ae.ip_address, ae.created_at,
             u.full_name as actor_name, u.email as actor_email, u.role as actor_role
      FROM audit_events ae
      LEFT JOIN users u ON ae.actor_id = u.id
      ${whereClause}
      ORDER BY ae.created_at DESC, ae.id DESC
      LIMIT $${queryParams.length - 1} OFFSET $${queryParams.length};
    `;

    const rowsRes = await client.query(sql, queryParams);
    const totalPages = totalEvents > 0 ? Math.ceil(totalEvents / limitNum) : 0;

    return {
      events: rowsRes.rows,
      total: totalEvents,
      pagination: {
        page: pageNum || Math.floor(offsetNum / limitNum) + 1,
        limit: limitNum,
        totalEvents,
        totalPages,
      },
    };
  }

  /**
   * Find refused transaction attempts specifically for an account at the database query level
   * Scopes strictly to the specified account to preserve isolation and privacy
   */
  async findRefusedByAccount(
    { accountId, accountNumber, limit = 50, startDate = null, endDate = null },
    client = pool
  ) {
    const conditions = [
      `ae.action ILIKE '%REFUSED%'`,
      `(ae.resource_id = $1 OR ae.metadata->>'accountNumber' = $2 OR ae.metadata->>'sourceAccountId' = $1 OR ae.metadata->>'sourceAccountNumber' = $2)`,
    ];
    const params = [accountId, accountNumber];

    if (startDate) {
      params.push(startDate);
      conditions.push(`ae.created_at >= $${params.length}`);
    }

    if (endDate) {
      const normalizedEndDate =
        typeof endDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(endDate.trim())
          ? `${endDate.trim()}T23:59:59.999Z`
          : endDate;
      params.push(normalizedEndDate);
      conditions.push(`ae.created_at <= $${params.length}`);
    }

    const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10) || 50));
    params.push(limitNum);

    const sql = `
      SELECT ae.id, ae.actor_id, ae.action, ae.resource_type, ae.resource_id,
             ae.metadata, ae.ip_address, ae.created_at,
             u.full_name as actor_name
      FROM audit_events ae
      LEFT JOIN users u ON ae.actor_id = u.id
      WHERE ${conditions.join(' AND ')}
      ORDER BY ae.created_at DESC, ae.id DESC
      LIMIT $${params.length};
    `;

    const res = await client.query(sql, params);
    return res.rows;
  }

  /**
   * Inspect recent lost-response / recovery audit events for a specific rotated refresh token ID
   */
  async findRefreshResponseLostState(tokenId, windowSeconds = 30, client = pool) {
    const sql = `
      SELECT
        EXISTS (
          SELECT 1
          FROM audit_events
          WHERE resource_type = 'REFRESH_TOKEN'
            AND resource_id = $1
            AND action = 'AUTH_REFRESH_RESPONSE_LOST'
            AND created_at >= NOW() - ($2::int * INTERVAL '1 second')
        ) AS has_recent_lost_response,
        EXISTS (
          SELECT 1
          FROM audit_events
          WHERE resource_type = 'REFRESH_TOKEN'
            AND resource_id = $1
            AND action = 'AUTH_REFRESH_RECOVERY_SUCCESS'
        ) AS already_recovered;
    `;
    const res = await client.query(sql, [String(tokenId), Number(windowSeconds) || 30]);
    const row = res.rows[0] || {};
    return {
      hasRecentLostResponse: Boolean(row.has_recent_lost_response),
      alreadyRecovered: Boolean(row.already_recovered),
    };
  }
}

export const auditRepository = new AuditRepository();

