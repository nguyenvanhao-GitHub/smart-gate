import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { SgComboboxComponent, SgComboboxSubmitEvent } from './sg-combobox.component';
import { SgSelectOption } from './sg-select.component';

describe('SgComboboxComponent — ô chọn kèm tìm kiếm', () => {
  let fixture: ComponentFixture<SgComboboxComponent>;
  let component: SgComboboxComponent;

  const mockOptions: SgSelectOption[] = [
    { value: 'DECLARATION_CREATE', label: 'Tạo hồ sơ' },
    { value: 'DECLARATION_UPDATE', label: 'Cập nhật hồ sơ' },
    { value: 'DECLARATION_DELETE', label: 'Xóa hồ sơ' },
    { value: 'ATTACHMENT_DELETE', label: 'Xóa tệp đính kèm' },
    { value: 'USER_DELETE', label: 'Xóa tài khoản' },
    { value: 'ROLE_DELETE', label: 'Xóa vai trò' },
    { value: 'AUTH_LOGIN', label: 'Đăng nhập hệ thống' },
  ];

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [SgComboboxComponent, FormsModule],
    });
    fixture = TestBed.createComponent(SgComboboxComponent);
    component = fixture.componentInstance;
    component.options = mockOptions;
    fixture.detectChanges();
  });

  it('khởi tạo với placeholder mặc định khi chưa chọn giá trị', () => {
    component.placeholder = 'Tất cả hành động';
    fixture.detectChanges();

    const trigger = fixture.nativeElement.querySelector('.combobox__trigger');
    expect(trigger.textContent.trim()).toContain('Tất cả hành động');
  });

  it('mở dropdown khi click vào trigger button', () => {
    const trigger = fixture.nativeElement.querySelector('.combobox__trigger') as HTMLButtonElement;
    trigger.click();
    fixture.detectChanges();

    const dropdown = fixture.nativeElement.querySelector('.combobox__dropdown');
    expect(dropdown).not.toBeNull();
    const searchInput = fixture.nativeElement.querySelector('.combobox__search-input');
    expect(searchInput).not.toBeNull();
  });

  it('lọc danh sách options thời gian thực khi gõ từ khóa tiếng Việt có dấu và không dấu', () => {
    component.open();
    fixture.detectChanges();

    // Gõ "xóa" (có dấu)
    (component as any).onSearchInput({ target: { value: 'xóa' } } as any);
    fixture.detectChanges();

    let filtered = (component as any).filteredOptions() as SgSelectOption[];
    expect(filtered.length).toBe(4);
    expect(filtered.map((o) => o.value)).toEqual([
      'DECLARATION_DELETE',
      'ATTACHMENT_DELETE',
      'USER_DELETE',
      'ROLE_DELETE',
    ]);

    // Gõ "xoa" (không dấu)
    (component as any).onSearchInput({ target: { value: 'xoa' } } as any);
    fixture.detectChanges();

    filtered = (component as any).filteredOptions() as SgSelectOption[];
    expect(filtered.length).toBe(4);

    // Gõ "login" (mã/label tiếng Anh)
    (component as any).onSearchInput({ target: { value: 'login' } } as any);
    fixture.detectChanges();

    filtered = (component as any).filteredOptions() as SgSelectOption[];
    expect(filtered.length).toBe(1);
    expect(filtered[0].value).toBe('AUTH_LOGIN');
  });

  it('click chọn một mục cụ thể thì gán value và emit valueChange', () => {
    let emittedValue = '';
    component.valueChange.subscribe((val) => (emittedValue = val));

    component.open();
    fixture.detectChanges();

    const targetOption = mockOptions[2]; // DECLARATION_DELETE: Xóa hồ sơ
    (component as any).selectOption(targetOption);
    fixture.detectChanges();

    expect(emittedValue).toBe('DECLARATION_DELETE');
    expect((component as any).valueSignal()).toBe('DECLARATION_DELETE');
    expect(component.displayLabel()).toBe('Xóa hồ sơ');
    expect(component.isOpen()).toBe(false);
  });

  it('gõ từ khóa và bấm Enter (submitCustomQuery) thì emit querySubmit với danh sách mã khớp', () => {
    let emittedSubmit: SgComboboxSubmitEvent | null = null;
    component.querySubmit.subscribe((ev) => (emittedSubmit = ev));

    component.open();
    fixture.detectChanges();

    (component as any).onSearchInput({ target: { value: 'xóa' } } as any);
    fixture.detectChanges();

    (component as any).submitCustomQuery();
    fixture.detectChanges();

    expect(emittedSubmit).not.toBeNull();
    expect(emittedSubmit!.query).toBe('xóa');
    expect(emittedSubmit!.matchedValues).toEqual([
      'DECLARATION_DELETE',
      'ATTACHMENT_DELETE',
      'USER_DELETE',
      'ROLE_DELETE',
    ]);
    expect(component.isOpen()).toBe(false);
    expect(component.displayLabel()).toContain('xóa');
  });

  it('nút xóa (clear) xóa sạch lựa chọn và reset về trạng thái ban đầu', () => {
    let emittedVal = 'init';
    component.valueChange.subscribe((v) => (emittedVal = v));

    (component as any).selectOption(mockOptions[0]);
    expect(component.hasValue()).toBe(true);

    const event = new MouseEvent('click');
    spyOn(event, 'stopPropagation');
    spyOn(event, 'preventDefault');

    (component as any).onClear(event);
    fixture.detectChanges();

    expect(emittedVal).toBe('');
    expect(component.hasValue()).toBe(false);
    expect((component as any).valueSignal()).toBe('');
    expect((component as any).customQuerySignal()).toBe('');
  });
});
