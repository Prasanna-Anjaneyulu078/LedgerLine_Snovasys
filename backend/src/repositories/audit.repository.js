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
      limit = 50,
      offset = 0,
      actorId = null,
      action = null,
      resourceType = null,
      startDate = null,
      endDate = null,
    } = {},
    client = pool
  ) {
    const conditions = [];
    const params = [];

    if (actorId) {
      params.push(actorId);
      conditions.push(`ae.actor_id = $${params.length}`);
    }

    if (action) {
      params.push(action);
      conditions.push(`ae.action = $${params.length}`);
    }

    if (resourceType) {
      params.push(resourceType);
      conditions.push(`ae.resource_type = $${params.length}`);
    }

    if (startDate) {
      params.push(startDate);
      conditions.push(`ae.created_at >= $${params.length}`);
    }

    if (endDate) {
      params.push(endDate);
      conditions.push(`ae.created_at <= $${params.length}`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    params.push(limit, offset);
    const sql = `
      SELECT ae.id, ae.actor_id, ae.action, ae.resource_type, ae.resource_id,
             ae.metadata, ae.ip_address, ae.created_at,
             u.full_name as actor_name, u.email as actor_email, u.role as actor_role
      FROM audit_events ae
      LEFT JOIN users u ON ae.actor_id = u.id
      ${whereClause}
      ORDER BY ae.created_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length};
    `;

    const countSql = `SELECT count(*) as total FROM audit_events ae ${whereClause};`;

    const [rowsRes, countRes] = await Promise.all([
      client.query(sql, params),
      client.query(countSql, params.slice(0, -2)),
    ]);

    return {
      events: rowsRes.rows,
      total: Number(countRes.rows[0].total),
    };
  }
}

export const auditRepository = new AuditRepository();

