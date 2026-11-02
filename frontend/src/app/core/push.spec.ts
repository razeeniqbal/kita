import { base64UrlToBytes } from './push';

describe('base64UrlToBytes', () => {
  it('decodes unpadded base64url, as VAPID public keys are written', () => {
    expect(Array.from(base64UrlToBytes('-_8'))).toEqual([0xfb, 0xff]);
    expect(Array.from(base64UrlToBytes('AQID'))).toEqual([1, 2, 3]);
    expect(base64UrlToBytes('BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM').length).toBe(65);
  });
});
