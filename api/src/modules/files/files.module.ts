import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccessControlModule } from '../access-control/access-control.module';
import { CatalogModule } from '../catalog/catalog.module';
import { DeclarationsModule } from '../declarations/declarations.module';
import { ATTACHMENT_REPOSITORY } from './application/ports/attachment.repository';
import { DOCUMENT_TYPE_CATALOG } from './application/ports/document-type-catalog.port';
import { DOSSIER_OWNERSHIP } from './application/ports/dossier-ownership.port';
import { STORAGE_PORT } from './application/ports/storage.port';
import { AttachmentScopeService } from './application/services/attachment-scope.service';
import { DeleteAttachmentUseCase } from './application/use-cases/delete-attachment.use-case';
import { DownloadAttachmentUseCase } from './application/use-cases/download-attachment.use-case';
import { GetAttachmentMetadataUseCase } from './application/use-cases/get-attachment-metadata.use-case';
import { UploadAttachmentUseCase } from './application/use-cases/upload-attachment.use-case';
import { AttachmentOrmEntity } from './infrastructure/persistence/attachment.orm-entity';
import { CatalogDocumentTypeAdapter } from './infrastructure/persistence/catalog-document-type.adapter';
import { DeclarationDossierOwnershipAdapter } from './infrastructure/persistence/declaration-dossier-ownership.adapter';
import { TypeOrmAttachmentRepository } from './infrastructure/persistence/typeorm-attachment.repository';
import { S3StorageAdapter } from './infrastructure/storage/s3-storage.adapter';
import { FilesController } from './presentation/http/files.controller';

/**
 * Phân hệ lưu trữ tệp đính kèm (F11). `AccessControlModule` cấp `DataScopeService`,
 * `DeclarationsModule` cấp dữ liệu chủ sở hữu hồ sơ, `CatalogModule` cấp danh mục loại chứng từ.
 * Chiều phụ thuộc một hướng: `files` → 3 module trên, không module nào import ngược lại.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([AttachmentOrmEntity]),
    AccessControlModule,
    DeclarationsModule,
    CatalogModule,
  ],
  controllers: [FilesController],
  providers: [
    { provide: ATTACHMENT_REPOSITORY, useClass: TypeOrmAttachmentRepository },
    { provide: STORAGE_PORT, useClass: S3StorageAdapter },
    { provide: DOSSIER_OWNERSHIP, useClass: DeclarationDossierOwnershipAdapter },
    { provide: DOCUMENT_TYPE_CATALOG, useClass: CatalogDocumentTypeAdapter },
    AttachmentScopeService,
    UploadAttachmentUseCase,
    DownloadAttachmentUseCase,
    GetAttachmentMetadataUseCase,
    DeleteAttachmentUseCase,
  ],
  exports: [ATTACHMENT_REPOSITORY, STORAGE_PORT],
})
export class FilesModule {}
