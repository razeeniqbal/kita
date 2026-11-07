import { TestBed } from '@angular/core/testing';
import { Api } from '../core/api';
import { Rsvp } from './rsvp';

const INVITE = {
  couple: 'Razeen & Sabrina', partners: ['Razeen', 'Sabrina'], closed: false,
  event: { mode: 'TUNANG', label: 'Tunang', name: 'Majlis Tunang', date: '2027-01-09', start_time: '11:00:00',
           venue: 'Dewan Seri Melati', rsvp_by: null, hosts: '', programme: '11:00 AM - Ketibaan tetamu' },
  guest: { name: 'Mak Long', seats: 4, rsvp: 'PENDING', note: '' },
};

describe('Rsvp page', () => {
  it('opens the envelope, takes an answer and a party size, then thanks the guest', async () => {
    const sent: unknown[] = [];
    TestBed.configureTestingModule({ providers: [{ provide: Api, useValue: {
      get: async () => structuredClone(INVITE),
      post: async (_: string, body: { rsvp: string; seats: number; note: string }) => {
        sent.push(body);
        return { ...INVITE, guest: { ...INVITE.guest, rsvp: body.rsvp, seats: body.seats, note: body.note } };
      },
    } }] });
    const f = TestBed.createComponent(Rsvp);
    f.componentRef.setInput('token', 'abc');
    await f.componentInstance.ngOnInit();
    f.detectChanges();
    const el = f.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Mak Long');

    el.querySelector<HTMLButtonElement>('.envelope')!.click();
    await new Promise(r => setTimeout(r, 1400));
    f.detectChanges();
    expect(el.textContent).toContain('Dewan Seri Melati');
    expect(el.textContent).not.toContain('Aturcara');

    el.querySelector<HTMLButtonElement>('.choice button')!.click();
    f.detectChanges();
    el.querySelector<HTMLButtonElement>('.stepper button')!.click();   // 4 → 3
    f.detectChanges();
    el.querySelector<HTMLFormElement>('form')!.dispatchEvent(new Event('submit'));
    await new Promise(r => setTimeout(r));
    f.detectChanges();
    expect(sent).toEqual([{ rsvp: 'ATTENDING', seats: 3, note: '' }]);
    expect(el.textContent).toContain('Jumpa di sana');
    expect(el.textContent).toContain('3 orang');
  });
});

describe('Rsvp page on the shared link', () => {
  it('asks for name and phone, then shows the guest their own answer', async () => {
    localStorage.clear();
    const calls: { path: string; body?: unknown }[] = [];
    const mine = { ...INVITE, guest: { name: 'Aina', seats: 2, rsvp: 'ATTENDING', note: '' } };
    TestBed.configureTestingModule({ providers: [{ provide: Api, useValue: {
      get: async (path: string) => (calls.push({ path }), path.startsWith('/invite/') ? { ...INVITE, guest: null } : mine),
      post: async (path: string, body: unknown) => (calls.push({ path, body }), { token: 'own-token' }),
    } }] });
    const f = TestBed.createComponent(Rsvp);
    f.componentRef.setInput('token', 'shared-token');
    f.componentRef.setInput('shared', true);
    await f.componentInstance.ngOnInit();
    f.detectChanges();
    const el = f.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Tetamu yang dihormati');

    el.querySelector<HTMLButtonElement>('.envelope')!.click();
    await new Promise(r => setTimeout(r, 1400));
    f.detectChanges();
    const [name, phone] = Array.from(el.querySelectorAll<HTMLInputElement>('.iv-field input'));
    name.value = 'Aina'; name.dispatchEvent(new Event('input'));
    phone.value = '012-345 6789'; phone.dispatchEvent(new Event('input'));
    el.querySelector<HTMLButtonElement>('.choice button')!.click();
    f.detectChanges();
    el.querySelector<HTMLButtonElement>('.stepper button:last-child')!.click();   // 1 → 2
    f.detectChanges();
    el.querySelector<HTMLFormElement>('form')!.dispatchEvent(new Event('submit'));
    await new Promise(r => setTimeout(r));
    f.detectChanges();

    const sent = calls.findIndex(c => c.body);
    expect(calls[sent]).toEqual({ path: '/invite/shared-token',
      body: { rsvp: 'ATTENDING', seats: 2, note: '', name: 'Aina', phone: '012-345 6789' } });
    expect(calls[sent + 1].path).toBe('/rsvp/own-token');
    expect(localStorage.getItem('kita-rsvp-shared-token')).toBe('own-token');
    expect(el.textContent).toContain('2 orang');
  });
});
