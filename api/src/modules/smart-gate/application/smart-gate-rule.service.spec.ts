import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PaginatedResult } from '../../../common/http/pagination';
import {
  DECLARATION_REPOSITORY,
  DeclarationRepository,
} from '../../declarations/application/ports/declaration.repository';
import { WorkflowPolicyService } from '../../declarations/application/workflow-policy.service';
import { Declaration } from '../../declarations/domain/declaration.entity';
import { DeclarationType } from '../../declarations/domain/declaration.enums';
import { makeDeclaration } from '../../declarations/testing/declaration.fixture';
import { FEE_SETTLEMENT } from '../../../common/fees/fee-settlement.port';
import { FakeFeeSettlement } from '../../fees/testing/fee.fixture';
import { WORKFLOW_INSTANCE_REPOSITORY } from '../../workflow/application/ports/workflow-instance.repository';
import { WORKFLOW_STEP_DIRECTORY } from '../../workflow/application/ports/workflow-step-directory.port';
import { WorkflowRouteService } from '../../workflow/application/services/workflow-route.service';
import {
  FakeStepDirectory,
  InMemoryWorkflowInstanceRepository,
  makeApprovedInstance,
} from '../../workflow/testing/workflow.fixture';
import { SmartGateRuleService } from './smart-gate-rule.service';

/** Repository giả — chỉ trả về hồ sơ được nạp sẵn, không đụng tới PostgreSQL. */
class FakeDeclarationRepository implements DeclarationRepository {
  private readonly store = new Map<string, Declaration>();

  seed(declaration: Declaration): void {
    this.store.set(declaration.id, declaration);
  }

  async nextCode(): Promise<string> {
    return 'CK-2026-9999';
  }

  async findMany(): Promise<Declaration[]> {
    return [...this.store.values()];
  }

  async findPage(): Promise<PaginatedResult<Declaration>> {
    const items = [...this.store.values()];
    return { items, total: items.length, page: 1, pageSize: items.length };
  }

  async count(): Promise<number> {
    return this.store.size;
  }

  async findById(id: string): Promise<Declaration | null> {
    return this.store.get(id) ?? null;
  }

  async findByCode(code: string): Promise<Declaration | null> {
    return [...this.store.values()].find((item) => item.code === code) ?? null;
  }

  async save(declaration: Declaration): Promise<Declaration> {
    this.store.set(declaration.id, declaration);
    return declaration;
  }

  async delete(id: string): Promise<void> {
    this.store.delete(id);
  }

  async countAppointmentsByTimeSlot(): Promise<Map<string, number>> {
    return new Map();
  }

  async findActiveConflicts(): Promise<any[]> {
    return [];
  }
}

describe('SmartGateRuleService', () => {
  let service: SmartGateRuleService;
  let repository: FakeDeclarationRepository;
  let instances: InMemoryWorkflowInstanceRepository;

  beforeEach(async () => {
    repository = new FakeDeclarationRepository();
    instances = new InMemoryWorkflowInstanceRepository();
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        SmartGateRuleService,
        WorkflowPolicyService,
        WorkflowRouteService,
        { provide: DECLARATION_REPOSITORY, useValue: repository },
        // Điều kiện nghiệp vụ mở cổng đọc từ phiên xử lý liên ngành + lộ trình bước (dữ liệu seed).
        { provide: WORKFLOW_INSTANCE_REPOSITORY, useValue: instances },
        { provide: WORKFLOW_STEP_DIRECTORY, useValue: new FakeStepDirectory() },
        // F39 — nghĩa vụ tài chính giả lập: mặc định hồ sơ chưa phát sinh khoản phí nào.
        { provide: FEE_SETTLEMENT, useValue: new FakeFeeSettlement() },
      ],
    }).compile();

    service = moduleRef.get(SmartGateRuleService);
  });

  describe('getOpenGateRules', () => {
    it('trả về đủ 4 quy tắc cổng', () => {
      const rules = service.getOpenGateRules();
      expect(rules.map((rule) => rule.checkpoint)).toEqual([
        'B2_IN_EXPORT',
        'B1_EXPORT_EXIT',
        'B1_IMPORT_ENTRY',
        'B2_IMPORT_EXIT',
      ]);
    });
  });

  describe('evaluateDeclaration', () => {
    it('BIÊN: hồ sơ không tồn tại → 404 kèm thông báo tiếng Việt', async () => {
      await expect(service.evaluateDeclaration('khong-ton-tai')).rejects.toThrow(NotFoundException);
      await expect(service.evaluateDeclaration('khong-ton-tai')).rejects.toThrow(
        'Không tìm thấy hồ sơ.',
      );
    });

    it('không truyền cổng thì tự suy ra cổng ra theo loại hồ sơ (luồng nhập)', async () => {
      repository.seed(makeDeclaration({ id: 'd-import', type: DeclarationType.IMPORT }));
      const result = await service.evaluateDeclaration('d-import');
      expect(result.gate).toBe('B2_IMPORT_EXIT');
    });

    it('không truyền cổng thì tự suy ra cổng ra theo loại hồ sơ (luồng xuất)', async () => {
      repository.seed(makeDeclaration({ id: 'd-export', type: DeclarationType.EXPORT }));
      const result = await service.evaluateDeclaration('d-export');
      expect(result.gate).toBe('B1_EXPORT_EXIT');
    });

    it('truyền cổng tường minh thì dùng đúng cổng đó', async () => {
      repository.seed(makeDeclaration({ id: 'd-import', type: DeclarationType.IMPORT }));
      const result = await service.evaluateDeclaration('d-import', 'B1_IMPORT_ENTRY');
      expect(result.gate).toBe('B1_IMPORT_ENTRY');
      expect(result.canOpen).toBe(true);
    });

    it('hồ sơ chưa có phiên xử lý nào → YELLOW và liệt kê đủ bước liên ngành còn thiếu', async () => {
      repository.seed(makeDeclaration({ id: 'd-import', type: DeclarationType.IMPORT }));
      const result = await service.evaluateDeclaration('d-import');
      expect(result.canOpen).toBe(false);
      expect(result.statusColor).toBe('YELLOW');
      expect(result.blockingReasons).toEqual([
        'Chưa hoàn thành bước "Biên phòng kiểm tra nghiệp vụ theo chuyên ngành" (Biên phòng).',
        'Chưa hoàn thành bước "Kiểm dịch kiểm tra nghiệp vụ theo chuyên ngành" (Kiểm dịch).',
        'Chưa hoàn thành bước "Hải quan kiểm tra nghiệp vụ theo chuyên ngành" (Hải quan).',
        'Chưa hoàn thành bước "Thu phí (nếu có)" (Cơ quan thu phí).',
      ]);
    });

    it('phiên đã duyệt hết các bước liên ngành → GREEN và mở cổng', async () => {
      repository.seed(makeDeclaration({ id: 'd-import', type: DeclarationType.IMPORT }));
      await instances.save(makeApprovedInstance('d-import', DeclarationType.IMPORT));
      const result = await service.evaluateDeclaration('d-import');
      expect(result.canOpen).toBe(true);
      expect(result.statusColor).toBe('GREEN');
    });
  });
});
