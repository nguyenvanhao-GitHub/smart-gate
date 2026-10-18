import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SgDatePickerComponent } from './sg-date-picker.component';

describe('SgDatePickerComponent (SG-118)', () => {
  let fixture: ComponentFixture<SgDatePickerComponent>;
  let component: SgDatePickerComponent;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [SgDatePickerComponent],
    });
    fixture = TestBed.createComponent(SgDatePickerComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('phat ra valueChange khi nguoi dung chon ngay qua su kien input', () => {
    const spy = jasmine.createSpy('valueChange');
    component.valueChange.subscribe(spy);

    const input: HTMLInputElement = fixture.nativeElement.querySelector('input[type="date"]');
    input.value = '2026-08-19';
    input.dispatchEvent(new Event('input'));

    expect(spy).toHaveBeenCalledWith('2026-08-19');
  });

  it('phat ra valueChange khi nguoi dung chon ngay qua su kien change tren lich', () => {
    const spy = jasmine.createSpy('valueChange');
    component.valueChange.subscribe(spy);

    const input: HTMLInputElement = fixture.nativeElement.querySelector('input[type="date"]');
    input.value = '2026-08-20';
    input.dispatchEvent(new Event('change'));

    expect(spy).toHaveBeenCalledWith('2026-08-20');
  });
});
