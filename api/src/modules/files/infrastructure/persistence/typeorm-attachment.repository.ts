import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AttachmentRepository } from '../../application/ports/attachment.repository';
import { AttachmentStatus } from '../../domain/attachment-status.enum';
import { Attachment } from '../../domain/attachment.entity';
import { AttachmentMapper } from './attachment.mapper';
import { AttachmentOrmEntity } from './attachment.orm-entity';

@Injectable()
export class TypeOrmAttachmentRepository implements AttachmentRepository {
  constructor(
    @InjectRepository(AttachmentOrmEntity)
    private readonly attachments: Repository<AttachmentOrmEntity>,
  ) {}

  async save(attachment: Attachment): Promise<Attachment> {
    const saved = await this.attachments.save(AttachmentMapper.toPersistence(attachment));
    return AttachmentMapper.toDomain(saved);
  }

  async findById(id: string): Promise<Attachment | null> {
    const row = await this.attachments.findOne({ where: { id } });
    return row ? AttachmentMapper.toDomain(row) : null;
  }

  async findByDossier(dossierId: string): Promise<Attachment[]> {
    const rows = await this.attachments.find({
      where: { dossierId, status: AttachmentStatus.ACTIVE },
      order: { uploadedAt: 'ASC' },
    });
    return rows.map((row) => AttachmentMapper.toDomain(row));
  }
}
