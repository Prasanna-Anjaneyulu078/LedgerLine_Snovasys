import { auditRepository } from '../../repositories/audit.repository.js';

export class AuditService {
  async getAuditEvents(query = {}) {
    return auditRepository.findAll(query);
  }
}

export const auditService = new AuditService();

