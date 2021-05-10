import { Response } from 'node-fetch';

export interface ParsedCookie {
  name: string;
  value: string;
  domain: string; 
}

export function parseCookies(domain: string, response: Response): Array<ParsedCookie>  {
  const raw = response.headers.raw()['set-cookie'];
  return raw.map((entry) => {
    const [cookie] = entry.split(';')
    const [name, value] = cookie.split('=')
    return { name, value, domain };
  });
}

export function toCookieString(cookies) {
  return cookies.map(cookie => `${cookie.name}=${cookie.value}`).join(';')
}
