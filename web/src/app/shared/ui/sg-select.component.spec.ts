import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { SgSelectComponent, SgSelectOption } from './sg-select.component';

describe('SgSelectComponent — ô chọn giá trị', () => {
  let fixture: ComponentFixture<SgSelectComponent>;
  let component: SgSelectComponent;

  const mockOptions: SgSelectOption[] = [
    { value: 'ALL', label: 'Toàn hệ thống' },
    { value: 'ORGANIZATION', label: 'Trong đơn vị' },
    { value: 'OWN', label: 'Hồ sơ của mình' },
    { value: 'ASSIGNMENT', label: 'Theo phân công' },
  ];

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [SgSelectComponent, FormsModule],
    });
    fixture = TestBed.createComponent(SgSelectComponent);
    component = fixture.componentInstance;
    component.options = mockOptions;
    fixture.detectChanges();
  });

  it('hiển thị placeholder mặc định khi chưa chọn giá trị', () => {
    component.placeholder = 'Chọn phạm vi';
    fixture.detectChanges();

    const selectEl = fixture.nativeElement.querySelector('select') as HTMLSelectElement;
    expect(selectEl.value).toBe('');
    const firstOption = selectEl.querySelector('option') as HTMLOptionElement;
    expect(firstOption.textContent?.trim()).toBe('Chọn phạm vi');
    expect(firstOption.selected).toBe(true);
  });

  it('chọn đúng option khi truyền value qua input', () => {
    component.value = 'ALL';
    fixture.detectChanges();

    const selectEl = fixture.nativeElement.querySelector('select') as HTMLSelectElement;
    expect(selectEl.value).toBe('ALL');
    const allOption = Array.from(selectEl.querySelectorAll('option')).find(
      (opt) => opt.value === 'ALL',
    ) as HTMLOptionElement;
    expect(allOption.selected).toBe(true);
  });

  it('phát sự kiện valueChange khi người dùng thay đổi lựa chọn', () => {
    spyOn(component.valueChange, 'emit');
    const selectEl = fixture.nativeElement.querySelector('select') as HTMLSelectElement;

    selectEl.value = 'ASSIGNMENT';
    selectEl.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    expect(component.valueChange.emit).toHaveBeenCalledWith('ASSIGNMENT');
  });

  it('hỗ trợ ControlValueAccessor writeValue và setDisabledState', () => {
    component.writeValue('ORGANIZATION');
    fixture.detectChanges();

    const selectEl = fixture.nativeElement.querySelector('select') as HTMLSelectElement;
    expect(selectEl.value).toBe('ORGANIZATION');

    component.setDisabledState(true);
    fixture.detectChanges();
    expect(selectEl.disabled).toBe(true);
  });

  it('ẩn option rỗng khi showEmptyOption = false', () => {
    component.showEmptyOption = false;
    fixture.detectChanges();

    const selectEl = fixture.nativeElement.querySelector('select') as HTMLSelectElement;
    const emptyOption = Array.from(selectEl.querySelectorAll('option')).find((opt) => opt.value === '');
    expect(emptyOption).toBeUndefined();
    expect(selectEl.querySelectorAll('option').length).toBe(4);
  });
});
