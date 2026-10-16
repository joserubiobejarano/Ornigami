import { headers } from 'next/headers';
export default async function Layout({ children }) {
  if ((await headers()).get('x-prototype-fail') === 'layout') throw new Error('Fictional layout regression');
  return <html><body>{children}</body></html>;
}
