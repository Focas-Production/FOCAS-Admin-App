import { useState, useEffect } from 'react';
import { PDFDocument } from 'pdf-lib';
import api from '../services/api';

const GREEN = '#1D9E75';

/* Triggers a browser download for in-memory blob/bytes. */
const saveBlob = (data, filename, type = 'application/pdf') => {
  const blob = data instanceof Blob ? data : new Blob([data], { type });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
};

/* ── badge color map ───────────────────────────────────────────── */
const BADGE_MAP = {
  paid:         { bg: '#dcfce7', color: '#15803d' },
  pending:      { bg: '#fee2e2', color: '#b91c1c' },
  'Group 1':    { bg: '#ede9fe', color: '#6d28d9' },
  'Group 2':    { bg: '#dbeafe', color: '#1d4ed8' },
  'Both Group': { bg: '#fef9c3', color: '#92400e' },
};

function Badge({ value }) {
  const s = BADGE_MAP[String(value)] || { bg: '#f1f5f9', color: '#64748b' };
  return (
    <span style={{ background: s.bg, color: s.color, padding: '2px 10px', borderRadius: 999, fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap', display: 'inline-block' }}>
      {value || '—'}
    </span>
  );
}

const SEL = (props) => (
  <select
    {...props}
    style={{ border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: 13, padding: '8px 10px', background: '#fff', color: '#374151', cursor: 'pointer', outline: 'none', minWidth: 120 }}
  />
);

const DATE = (props) => (
  <input
    type="date"
    {...props}
    style={{ border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: 13, padding: '7px 10px', background: '#fff', color: '#374151', outline: 'none' }}
  />
);

const EMPTY = { q: '', paymentStatus: '', groupSelection: '', startDate: '', endDate: '' };

export default function ManualPro() {
  const [rows,    setRows]    = useState([]);
  const [total,   setTotal]   = useState(0);
  const [page,    setPage]    = useState(1);
  const [pages,   setPages]   = useState(1);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');
  const [filters, setFilters] = useState(EMPTY);
  const [inputQ,  setInputQ]  = useState('');
  const [selected, setSelected] = useState(null);
  const [statusModal, setStatusModal] = useState(null);      // { order } — shows shipment.statusHistory
  const [picked,   setPicked]   = useState(() => new Set()); // selected row ids for bulk ops
  const [rateModal, setRateModal] = useState(null);          // { name, loading, address, cost, error }
  const [busyById, setBusyById] = useState({});              // { [id]: 'rate' | 'sync' | 'label' }
  const [bulkBusy, setBulkBusy] = useState('');              // '' | 'sync' | 'label'

  const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

  const fetchRows = async (p = 1, f = filters) => {
    setLoading(true); setError('');
    const q = new URLSearchParams({ page: p, limit: 20 });
    if (f.q)              q.set('q', f.q);
    if (f.paymentStatus)  q.set('paymentStatus', f.paymentStatus);
    if (f.groupSelection) q.set('groupSelection', f.groupSelection);
    if (f.startDate)      q.set('startDate', f.startDate);
    if (f.endDate)        q.set('endDate', f.endDate);
    try {
      const d = await api.get(`/manual-class/orders?${q}`).then(r => r.data);
      if (d.success) { setRows(d.orders); setTotal(d.total); setPages(d.pages || 1); setPage(p); }
      else setError('Failed to load data.');
    } catch (_) { setError('Cannot reach backend — check VITE_API_BASE_URL in .env'); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchRows(1, EMPTY); }, []);

  const apply = () => { const f = { ...filters, q: inputQ }; setFilters(f); fetchRows(1, f); };
  const clear = () => { setInputQ(''); setFilters(EMPTY); fetchRows(1, EMPTY); };
  const setF  = (k, v) => setFilters(f => ({ ...f, [k]: v }));

  /* ── row selection ─────────────────────────────────────────────── */
  const togglePick = (id) => setPicked(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });
  const toggleAll = () => setPicked(prev =>
    prev.size === rows.length ? new Set() : new Set(rows.map(r => r._id)));

  const setBusy = (id, v) => setBusyById(prev => {
    const next = { ...prev };
    if (v) next[id] = v; else delete next[id];
    return next;
  });

  /* ── per-row: rate (shows address + cost in a popup) ───────────── */
  const getRate = async (order) => {
    const id = order._id;
    setBusy(id, 'rate');
    setRateModal({ name: order.name, loading: true });
    try {
      const d = await api.get(`/manual-class/get-rate/${id}`).then(r => r.data);
      if (d.success) {
        const r0 = Array.isArray(d.rates) ? d.rates[0] : d.rates;
        const cost = r0?.total_amount ?? r0?.charge_DL ?? null;
        setRateModal({ name: order.name, address: d.address || order.address, cost, dPin: d.d_pin });
      } else {
        setRateModal({ name: order.name, error: d.message || 'Failed to fetch rate' });
      }
    } catch (_) {
      setRateModal({ name: order.name, error: 'Network error' });
    } finally { setBusy(id, null); }
  };

  /* ── per-row: sync ─────────────────────────────────────────────── */
  const syncOne = async (id) => {
    setBusy(id, 'sync');
    try {
      const d = await api.post(`/manual-class/sync-shipment/${id}`).then(r => r.data);
      const awb = d.awb;
      if (d.success && awb) {
        setRows(prev => prev.map(r => r._id === id ? { ...r, shipment: { ...(r.shipment || {}), awb, trackingStatus: 'Manifested' } } : r));
      } else {
        alert(d.error || d.message || 'Sync failed');
      }
    } catch (err) {
      // axios throws on non-2xx — handle "already synced" (409) gracefully.
      const status = err.response?.status;
      const d = err.response?.data || {};
      if (status === 409 && d.awb) {
        setRows(prev => prev.map(r => r._id === id ? { ...r, shipment: { ...(r.shipment || {}), awb: d.awb } } : r));
        alert('Already synced — AWB ' + d.awb);
      } else {
        alert(d.error || d.message || 'Network error during sync');
      }
    }
    finally { setBusy(id, null); }
  };

  /* ── per-row: label ────────────────────────────────────────────── */
  const labelOne = async (id, awb) => {
    setBusy(id, 'label');
    try {
      const res = await api.get(`/manual-class/get-label/${awb}`, { responseType: 'blob' });
      saveBlob(res.data, `label-${awb}.pdf`);
    } catch (e) { alert(e.message || 'Label download failed'); }
    finally { setBusy(id, null); }
  };

  /* ── bulk: sync ────────────────────────────────────────────────── */
  const bulkSync = async () => {
    const ids = rows.filter(r => picked.has(r._id) && !r.shipment?.awb).map(r => r._id);
    if (ids.length === 0) return alert('Select one or more un-synced orders first.');
    setBulkBusy('sync');
    try {
      const d = await api.post('/manual-class/sync-shipment/bulk', { registrationIds: ids }).then(r => r.data);
      if (d.results) {
        const awbMap = {};
        d.results.forEach(r => { if (r.awb) awbMap[r.registrationId] = r.awb; });
        setRows(prev => prev.map(r => awbMap[r._id]
          ? { ...r, shipment: { ...(r.shipment || {}), awb: awbMap[r._id], trackingStatus: 'Manifested' } }
          : r));
        alert(`Bulk sync done — ${d.synced} synced, ${d.failed} failed.`);
      } else {
        alert(d.error || 'Bulk sync failed');
      }
    } catch (_) { alert('Network error during bulk sync'); }
    finally { setBulkBusy(''); }
  };

  /* ── bulk: label ───────────────────────────────────────────────── */
  // Delhivery's combined endpoint only returns one label, so we fetch each
  // label individually and merge them into a single PDF here in the browser.
  const bulkLabel = async () => {
    const awbs = rows.filter(r => picked.has(r._id) && r.shipment?.awb).map(r => r.shipment.awb);
    if (awbs.length === 0) return alert('Select one or more synced orders (with AWB) first.');
    setBulkBusy('label');
    try {
      const merged = await PDFDocument.create();
      const failed = [];
      for (const awb of awbs) {
        try {
          const res   = await api.get(`/manual-class/get-label/${awb}`, { responseType: 'arraybuffer' });
          const src   = await PDFDocument.load(res.data);
          const pages = await merged.copyPages(src, src.getPageIndices());
          pages.forEach(p => merged.addPage(p));
        } catch (_) { failed.push(awb); }
      }
      if (merged.getPageCount() === 0) {
        alert('Could not fetch any labels.' + (failed.length ? ` Failed: ${failed.join(', ')}` : ''));
        return;
      }
      const out = await merged.save();
      saveBlob(out, `labels-${merged.getPageCount()}.pdf`);
      if (failed.length) alert(`Generated ${awbs.length - failed.length} label(s). Failed: ${failed.join(', ')}`);
    } catch (e) { alert(e.message || 'Bulk label generation failed'); }
    finally { setBulkBusy(''); }
  };

  const card = { background: '#fff', border: '1.5px solid #e2e8f0', borderRadius: 16 };
  const btn  = (bg, color = '#fff') => ({
    background: bg, color, border: 'none', borderRadius: 8, padding: '8px 18px',
    fontSize: 13, fontWeight: 700, cursor: 'pointer',
  });
  const th = { padding: '11px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700,
               color: '#94a3b8', whiteSpace: 'nowrap', letterSpacing: '0.06em', textTransform: 'uppercase' };
  const td = { padding: '12px 14px', fontSize: 13 };
  const actionBtn = (bg) => ({
    background: bg, color: '#fff', border: 'none', borderRadius: 7, padding: '5px 11px',
    fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
  });

  return (
    <div style={{ padding: '24px 20px', maxWidth: 1600, margin: '0 auto' }}>

      {/* ── Header ──────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20, gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 900, color: '#0f172a', margin: 0 }}>Manual Class Orders</h1>
          <p  style={{ fontSize: 12, color: '#94a3b8', margin: '3px 0 0' }}>Manual class registrations &amp; payments</p>
        </div>
        <button onClick={() => fetchRows(page, filters)} style={btn(GREEN)}>↻ Refresh</button>
      </div>

      {/* ── Filter bar ──────────────────────────────────────────────── */}
      <div style={{ ...card, padding: '16px 20px', marginBottom: 16 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
          <input
            style={{ flex: '1 1 240px', border: '1.5px solid #e2e8f0', borderRadius: 8, padding: '8px 14px', fontSize: 13, outline: 'none', color: '#374151', minWidth: 0 }}
            placeholder="🔍  Search phone / order ID / name…"
            value={inputQ}
            onChange={e => setInputQ(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && apply()}
          />
          <SEL value={filters.paymentStatus} onChange={e => setF('paymentStatus', e.target.value)}>
            <option value="">All Payments</option>
            <option value="paid">Paid</option>
            <option value="pending">Pending</option>
          </SEL>
          <SEL value={filters.groupSelection} onChange={e => setF('groupSelection', e.target.value)}>
            <option value="">All Groups</option>
            <option value="Group 1">Group 1</option>
            <option value="Group 2">Group 2</option>
            <option value="Both Group">Both Group</option>
          </SEL>
          <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b' }}>From</label>
          <DATE value={filters.startDate} onChange={e => setF('startDate', e.target.value)} />
          <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b' }}>To</label>
          <DATE value={filters.endDate} onChange={e => setF('endDate', e.target.value)} />
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <button onClick={apply} style={btn(GREEN)}>Apply Filters</button>
          <button onClick={clear} style={btn('#f1f5f9', '#64748b')}>Clear</button>
        </div>
      </div>

      {/* ── Error banner ────────────────────────────────────────────── */}
      {error && (
        <div style={{ background: '#fef2f2', border: '1.5px solid #fecaca', borderRadius: 12, padding: '12px 16px', marginBottom: 14, fontSize: 13, color: '#dc2626', fontWeight: 600 }}>
          ⚠️ {error}
        </div>
      )}

      {/* ── Bulk action bar ─────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: picked.size ? '#0f172a' : '#94a3b8' }}>
          {picked.size} selected
        </span>
        <button
          onClick={bulkSync}
          disabled={!picked.size || bulkBusy}
          style={{ ...btn(picked.size && !bulkBusy ? '#2563eb' : '#cbd5e1'), cursor: (!picked.size || bulkBusy) ? 'not-allowed' : 'pointer' }}
        >
          {bulkBusy === 'sync' ? 'Syncing…' : '⇪ Bulk Sync'}
        </button>
        <button
          onClick={bulkLabel}
          disabled={!picked.size || bulkBusy}
          style={{ ...btn(picked.size && !bulkBusy ? '#7c3aed' : '#cbd5e1'), cursor: (!picked.size || bulkBusy) ? 'not-allowed' : 'pointer' }}
        >
          {bulkBusy === 'label' ? 'Generating…' : '🏷 Bulk Label'}
        </button>
      </div>

      {/* ── Table ───────────────────────────────────────────────────── */}
      <div style={{ ...card, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1.5px solid #e2e8f0' }}>
                <th style={th}>
                  <input
                    type="checkbox"
                    checked={rows.length > 0 && picked.size === rows.length}
                    onChange={toggleAll}
                    style={{ cursor: 'pointer', width: 15, height: 15 }}
                  />
                </th>
                {['#','Date','Name','Phone','Group','Amount','Payment','Order ID','Status','Action'].map(h => (
                  <th key={h} style={th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={11} style={{ ...td, textAlign: 'center', padding: 56, color: '#94a3b8' }}>Loading…</td></tr>
              )}
              {!loading && rows.length === 0 && (
                <tr><td colSpan={11} style={{ ...td, textAlign: 'center', padding: 56, color: '#94a3b8' }}>No orders found.</td></tr>
              )}
              {!loading && rows.map((o, i) => {
                const awb  = o.shipment?.awb;
                const busy = busyById[o._id];
                return (
                <tr
                  key={o._id}
                  onClick={() => setSelected(o)}
                  style={{ borderBottom: '1px solid #f1f5f9', transition: 'background .12s', cursor: 'pointer', background: picked.has(o._id) ? '#f0fdf9' : '#fff' }}
                  onMouseEnter={e => e.currentTarget.style.background = picked.has(o._id) ? '#e6fbf2' : '#f8fafc'}
                  onMouseLeave={e => e.currentTarget.style.background = picked.has(o._id) ? '#f0fdf9' : '#fff'}
                >
                  <td style={td} onClick={e => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={picked.has(o._id)}
                      onChange={() => togglePick(o._id)}
                      style={{ cursor: 'pointer', width: 15, height: 15 }}
                    />
                  </td>
                  <td style={{ ...td, color: '#94a3b8', fontSize: 12 }}>{(page - 1) * 20 + i + 1}</td>
                  <td style={{ ...td, color: '#475569', whiteSpace: 'nowrap' }}>{fmtDate(o.createdAt)}</td>
                  <td style={{ ...td, fontWeight: 700, color: '#0f172a', whiteSpace: 'nowrap' }}>{o.name}</td>
                  <td style={{ ...td, color: '#475569', whiteSpace: 'nowrap' }}>{o.phone}</td>
                  <td style={td}><Badge value={o.groupSelection} /></td>
                  <td style={{ ...td, fontWeight: 700, color: '#0f172a', whiteSpace: 'nowrap' }}>
                    ₹{((o.amount || 0) / 100).toLocaleString('en-IN')}
                  </td>
                  <td style={td}><Badge value={o.paymentStatus} /></td>
                  <td style={{ ...td, color: '#64748b', fontSize: 12, fontFamily: 'monospace', whiteSpace: 'nowrap' }}>{o.razorpayOrderId || '—'}</td>
                  <td style={td} onClick={e => e.stopPropagation()}>
                    {(() => {
                      const hist   = o.shipment?.statusHistory || [];
                      const latest = o.shipment?.trackingStatus || (hist.length ? hist[hist.length - 1].status : null);
                      if (!latest) return <span style={{ color: '#cbd5e1', fontSize: 12 }}>—</span>;
                      const delivered = String(latest).toLowerCase() === 'delivered';
                      return (
                        <button
                          onClick={() => setStatusModal({ order: o })}
                          title="View status history"
                          style={{
                            ...actionBtn('#0f172a'),
                            background: delivered ? '#dcfce7' : '#eef2ff',
                            color:      delivered ? '#15803d' : '#4338ca',
                          }}
                        >
                          {latest}
                        </button>
                      );
                    })()}
                  </td>
                  <td style={td} onClick={e => e.stopPropagation()}>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      {awb
                        ? (
                          // Synced: show AWB + Label only (no Rate, no Sync).
                          <>
                            <span style={{ fontSize: 11, fontWeight: 700, color: '#16a34a', whiteSpace: 'nowrap' }}>✓ {awb}</span>
                            <button
                              onClick={() => labelOne(o._id, awb)}
                              disabled={busy === 'label'}
                              style={actionBtn('#7c3aed')}
                            >
                              {busy === 'label' ? '…' : 'Label'}
                            </button>
                          </>
                        )
                        : (
                          // Not synced: Rate + Sync.
                          <>
                            <button
                              onClick={() => getRate(o)}
                              disabled={busy === 'rate'}
                              style={actionBtn('#0891b2')}
                            >
                              {busy === 'rate' ? '…' : 'Rate'}
                            </button>
                            <button
                              onClick={() => syncOne(o._id)}
                              disabled={busy === 'sync'}
                              style={actionBtn('#2563eb')}
                            >
                              {busy === 'sync' ? 'Syncing…' : 'Sync'}
                            </button>
                          </>
                        )}
                    </div>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px', borderTop: '1.5px solid #f1f5f9', flexWrap: 'wrap', gap: 8 }}>
          <span style={{ fontSize: 12, color: '#94a3b8' }}>
            Showing <strong style={{ color: '#475569' }}>{rows.length}</strong> of <strong style={{ color: '#475569' }}>{total}</strong> orders
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {[
              { label: '← Prev', disabled: page <= 1,     action: () => fetchRows(page - 1, filters) },
              { label: 'Next →', disabled: page >= pages, action: () => fetchRows(page + 1, filters) },
            ].map(({ label, disabled, action }, idx) => (
              <button
                key={idx}
                disabled={disabled}
                onClick={action}
                style={{ border: '1.5px solid #e2e8f0', background: disabled ? '#f8fafc' : '#fff', borderRadius: 8, padding: '6px 14px', fontSize: 12, fontWeight: 700, cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1, color: '#374151' }}
              >
                {label}
              </button>
            ))}
            <span style={{ fontSize: 12, fontWeight: 600, color: '#64748b', padding: '0 4px' }}>
              {page} / {pages}
            </span>
          </div>
        </div>
      </div>

      {/* ── Detail drawer ───────────────────────────────────────────── */}
      {selected && (
        <OrderDetail order={selected} onClose={() => setSelected(null)} fmtDate={fmtDate} />
      )}

      {/* ── Rate popup ──────────────────────────────────────────────── */}
      {rateModal && (
        <RatePopup data={rateModal} onClose={() => setRateModal(null)} />
      )}

      {/* ── Status history popup ────────────────────────────────────── */}
      {statusModal && (
        <StatusHistoryPopup order={statusModal.order} onClose={() => setStatusModal(null)} />
      )}
    </div>
  );
}

/* ── Shipment status history popup ───────────────────────────────── */
function StatusHistoryPopup({ order, onClose }) {
  const ship    = order.shipment || {};
  const history = [...(ship.statusHistory || [])].sort(
    (a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0)
  );
  const fmt = (d) => d ? new Date(d).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '—';

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, zIndex: 110 }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ background: '#fff', borderRadius: 16, width: 460, maxWidth: '92vw', maxHeight: '82vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 22px', borderBottom: '1.5px solid #e2e8f0', flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 900, color: '#0f172a' }}>Status History</div>
            <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>
              {order.name}{ship.awb ? ` · AWB ${ship.awb}` : ''}
            </div>
          </div>
          <button onClick={onClose} style={{ background: '#f1f5f9', border: 'none', borderRadius: 8, width: 32, height: 32, fontSize: 17, fontWeight: 700, color: '#64748b', cursor: 'pointer' }}>×</button>
        </div>

        <div style={{ padding: '18px 22px', overflowY: 'auto' }}>
          {ship.trackingStatus && (
            <div style={{ background: '#eef2ff', border: '1.5px solid #c7d2fe', borderRadius: 12, padding: '12px 16px', marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#6366f1', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Current Status</div>
              <div style={{ fontSize: 16, fontWeight: 900, color: '#3730a3', marginTop: 2 }}>{ship.trackingStatus}</div>
              {ship.trackingLocation && <div style={{ fontSize: 12, color: '#6366f1', marginTop: 2 }}>{ship.trackingLocation}</div>}
            </div>
          )}

          {history.length === 0 ? (
            <div style={{ color: '#94a3b8', fontSize: 14, padding: '20px 0', textAlign: 'center' }}>No status history yet.</div>
          ) : (
            <div>
              {history.map((h, i) => (
                <div key={i} style={{ display: 'flex', gap: 12, paddingBottom: 16, position: 'relative' }}>
                  {/* timeline dot + line */}
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
                    <span style={{ width: 11, height: 11, borderRadius: 999, background: i === 0 ? GREEN : '#cbd5e1', marginTop: 3 }} />
                    {i < history.length - 1 && <span style={{ flex: 1, width: 2, background: '#e2e8f0', marginTop: 2 }} />}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>{h.status || '—'}</div>
                    {h.location && <div style={{ fontSize: 12, color: '#64748b', marginTop: 1 }}>{h.location}</div>}
                    <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 1 }}>{fmt(h.timestamp)}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Shipping rate popup ─────────────────────────────────────────── */
function RatePopup({ data, onClose }) {
  const a = data.address || {};
  const addrLine = [a.line1, a.line2, a.city, a.state, a.pincode, a.country].filter(Boolean).join(', ');
  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, zIndex: 110 }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ background: '#fff', borderRadius: 16, width: 420, maxWidth: '92vw', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 22px', borderBottom: '1.5px solid #e2e8f0' }}>
          <div style={{ fontSize: 16, fontWeight: 900, color: '#0f172a' }}>Shipping Rate</div>
          <button onClick={onClose} style={{ background: '#f1f5f9', border: 'none', borderRadius: 8, width: 32, height: 32, fontSize: 17, fontWeight: 700, color: '#64748b', cursor: 'pointer' }}>×</button>
        </div>
        <div style={{ padding: '18px 22px' }}>
          <div style={{ fontSize: 13, color: '#64748b', marginBottom: 14 }}>{data.name}</div>

          {data.loading && <div style={{ color: '#94a3b8', fontSize: 14, padding: '20px 0', textAlign: 'center' }}>Fetching rate…</div>}

          {data.error && <div style={{ color: '#dc2626', fontSize: 14, fontWeight: 600 }}>⚠️ {data.error}</div>}

          {!data.loading && !data.error && (
            <>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Delivery Address</div>
              <div style={{ fontSize: 14, color: '#0f172a', lineHeight: 1.5, marginBottom: 18 }}>{addrLine || '—'}</div>

              <div style={{ background: '#ecfeff', border: '1.5px solid #06b6d420', borderRadius: 12, padding: '16px 18px', display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#0e7490' }}>Shipping Cost</span>
                <span style={{ fontSize: 26, fontWeight: 900, color: '#0891b2' }}>
                  {data.cost != null ? `₹${data.cost}` : 'N/A'}
                </span>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Order detail modal ──────────────────────────────────────────── */
function OrderDetail({ order: o, onClose, fmtDate }) {
  const fmtDateTime = (d) => d ? new Date(d).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '—';

  const Row = ({ label, value, mono }) => (
    <div style={{ display: 'flex', gap: 12, padding: '9px 0', borderBottom: '1px solid #f1f5f9' }}>
      <div style={{ flex: '0 0 150px', fontSize: 12, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
      <div style={{ flex: 1, fontSize: 13, color: '#0f172a', fontFamily: mono ? 'monospace' : 'inherit', wordBreak: 'break-word' }}>{value ?? '—'}</div>
    </div>
  );

  const Section = ({ title, children }) => (
    <div style={{ marginBottom: 18 }}>
      <div style={{ fontSize: 12, fontWeight: 800, color: '#1D9E75', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>{title}</div>
      {children}
    </div>
  );

  const addr = o.address || {};
  const ship = o.shipment || {};
  const addrLine = [addr.line1, addr.line2, addr.city, addr.state, addr.pincode, addr.country].filter(Boolean).join(', ');

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.35)', display: 'flex', justifyContent: 'flex-end', zIndex: 100 }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ background: '#fff', width: 420, maxWidth: '92vw', height: '100%', boxShadow: '-12px 0 40px rgba(0,0,0,0.18)', display: 'flex', flexDirection: 'column', animation: 'mc-slide-in .22s ease-out' }}
      >
        {/* header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 24px', borderBottom: '1.5px solid #e2e8f0', flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 900, color: '#0f172a' }}>{o.name}</div>
            <div style={{ fontSize: 12, color: '#94a3b8' }}>Order placed {fmtDate(o.createdAt)}</div>
          </div>
          <button
            onClick={onClose}
            style={{ background: '#f1f5f9', border: 'none', borderRadius: 8, width: 34, height: 34, fontSize: 18, fontWeight: 700, color: '#64748b', cursor: 'pointer' }}
          >×</button>
        </div>

        {/* body */}
        <div style={{ padding: '18px 24px', overflowY: 'auto', flex: 1 }}>
          <Section title="Customer">
            <Row label="Name"  value={o.name} />
            <Row label="Phone" value={o.phone} />
          </Section>

          <Section title="Order">
            <Row label="Group"   value={o.groupSelection} />
            <Row label="Amount"  value={`₹${((o.amount || 0) / 100).toLocaleString('en-IN')}`} />
            <Row label="Payment" value={o.paymentStatus} />
            <Row label="Weight"  value={o.weight ? `${o.weight} g` : '—'} />
            <Row label="Order ID"   value={o.razorpayOrderId} mono />
            <Row label="Payment ID" value={o.razorpayPaymentId} mono />
          </Section>

          <Section title="Delivery Address">
            <Row label="Address" value={addrLine || '—'} />
          </Section>

          {ship.awb && (
            <Section title="Shipment">
              <Row label="AWB"       value={ship.awb} mono />
              <Row label="Sort Code" value={ship.sortCode} />
              <Row label="Status"    value={ship.trackingStatus} />
              <Row label="Location"  value={ship.trackingLocation} />
              <Row label="Created"   value={fmtDateTime(ship.createdAt)} />
            </Section>
          )}

          <Section title="Timestamps">
            <Row label="Created" value={fmtDateTime(o.createdAt)} />
            <Row label="Updated" value={fmtDateTime(o.updatedAt)} />
          </Section>
        </div>
      </div>
    </div>
  );
}
