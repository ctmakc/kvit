import { ElectrumClient } from '@electrum-cash/network';
import { ElectrumWebSocket } from '@electrum-cash/web-socket';
for (const h of process.argv.slice(2)) {
  try {
    const c = new ElectrumClient('kvit', '1.4.3', new ElectrumWebSocket(h, 50004, true, 8000));
    await c.connect();
    const tip = await c.request('blockchain.headers.get_tip');
    console.log(h, 'OK', JSON.stringify(tip).slice(0, 80));
    await c.disconnect();
  } catch (e) { console.log(h, 'FAIL', e.message || e); }
}
process.exit(0)
