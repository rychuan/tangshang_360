// server/modules/bitable-connection/bitable-connection.service.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { BitableConnectionService } from './bitable-connection.service';

describe('BitableConnectionService', () => {
  let service: BitableConnectionService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BitableConnectionService,
        { provide: 'DRIZZLE_DATABASE', useValue: {} },
        { provide: 'EmployeeBindingService', useValue: {} },
        { provide: 'RoleManagerService', useValue: {} },
      ],
    }).compile();

    service = module.get<BitableConnectionService>(
      BitableConnectionService,
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('parseRow', () => {
    it('should map bitable column names to system fields', () => {
      const fields = {
        '姓名': '张三',
        '工号': 'E001',
        '岗位': '工程师',
      };
      const result = (service as any).parseRow(fields);
      expect(result.name).toBe('张三');
      expect(result.employeeNo).toBe('E001');
      expect(result.position).toBe('工程师');
    });
  });

  describe('validateRow', () => {
    it('should reject rows missing name', () => {
      const row = { employeeNo: 'E001', position: '工程师' };
      const result = (service as any).validateRow(
        row,
        new Set(),
        new Map(),
      );
      expect(result).toBe('缺少姓名');
    });

    it('should reject rows missing employeeNo', () => {
      const row = { name: '张三', position: '工程师' };
      const result = (service as any).validateRow(
        row,
        new Set(),
        new Map(),
      );
      expect(result).toBe('缺少工号');
    });

    it('should pass valid rows', () => {
      const row = {
        name: '张三',
        employeeNo: 'E001',
        position: '工程师',
      };
      const result = (service as any).validateRow(
        row,
        new Set(),
        new Map(),
      );
      expect(result).toBeNull();
    });

    it('should reject invalid departments', () => {
      const row = {
        name: '张三',
        employeeNo: 'E001',
        position: '工程师',
        department: '不存在的部门',
      };
      const result = (service as any).validateRow(
        row,
        new Set(['研发部']),
        new Map(),
      );
      expect(result).toContain('不存在');
    });

    it('should reject invalid template names', () => {
      const row = {
        name: '张三',
        employeeNo: 'E001',
        position: '工程师',
        templateName: '不存在的模板',
      };
      const result = (service as any).validateRow(
        row,
        new Set(),
        new Map(),
      );
      expect(result).toContain('不存在');
    });
  });
});
