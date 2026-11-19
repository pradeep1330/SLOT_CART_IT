import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import { Bar, Doughnut } from 'react-chartjs-2';
import {
  IndianRupee,
  ShoppingBag,
  Truck,
  AlertTriangle,
  Package,
  Clock,
  RefreshCw,
} from 'lucide-react';
import toast from 'react-hot-toast';
import api, { getErrorMessage } from '../api/axios';
import { formatINR, getStatusBadgeClass } from '../utils/formatters';

ChartJS.register(CategoryScale, LinearScale, BarElement, ArcElement, Title, Tooltip, Legend);

export default function AdminDashboard() {
  const [data, setData] = useState(null);
  const [pincodeFilter, setPincodeFilter] = useState('');
  const [loading, setLoading] = useState(true);

  const fetchDashboard = useCallback(async () => {
    try {
      setLoading(true);
      const { data: res } = await api.get('/admin/dashboard', {
        params: pincodeFilter ? { pincode: pincodeFilter } : {},
      });
      setData(res);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to load admin analytics.'));
    } finally {
      setLoading(false);
    }
  }, [pincodeFilter]);

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  const stats = data?.stats || {};
  const analytics = data?.slotAnalytics || null;

  const dayBarData = analytics
    ? {
        labels: analytics.by_date.map((d) => d.short_label),
        datasets: [
          {
            label: 'Booked Orders',
            data: analytics.by_date.map((d) => d.total_booked),
            backgroundColor: '#4F46E5',
            borderRadius: 6,
          },
          {
            label: 'Remaining Capacity',
            data: analytics.by_date.map((d) => Math.max(0, d.total_capacity - d.total_booked)),
            backgroundColor: '#D1FAE5',
            borderRadius: 6,
          },
        ],
      }
    : null;

  const slotDoughnutData = analytics
    ? {
        labels: analytics.by_slot.map((s) => s.label),
        datasets: [
          {
            label: 'Utilization %',
            data: analytics.by_slot.map((s) => s.total_booked || 0),
            backgroundColor: ['#4F46E5', '#10B981', '#F59E0B', '#6366F1', '#0EA5E9'],
            borderWidth: 2,
            borderColor: '#ffffff',
          },
        ],
      }
    : null;

  return (
    <div className="container page-section">
      <div className="dashboard-header">
        <div>
          <span className="eyebrow">Operations Console</span>
          <h1>Admin Dashboard</h1>
          <p className="text-muted">
            Monitor store revenue, order fulfillment, and real-time Python Slot Engine utilization.
          </p>
        </div>

        <div className="dashboard-header-actions">
          <Link to="/admin/products" className="btn btn-outline btn-sm">
            <Package size={16} /> Products
          </Link>
          <Link to="/admin/orders" className="btn btn-outline btn-sm">
            <Truck size={16} /> Orders
          </Link>
          <Link to="/admin/slots" className="btn btn-emerald btn-sm">
            <Clock size={16} /> Manage Slot Capacity
          </Link>
        </div>
      </div>

      {/* KPI Metric Cards */}
      {loading && !data ? (
        <div className="kpi-grid">
          {[1, 2, 3, 4].map((n) => (
            <div key={n} className="skeleton-box" style={{ height: '115px' }} />
          ))}
        </div>
      ) : (
        <>
          <div className="kpi-grid">
            <div className="card kpi-card">
              <div className="kpi-icon kpi-indigo">
                <ShoppingBag size={22} />
              </div>
              <div>
                <span className="kpi-label">Total Orders</span>
                <strong className="kpi-value">{stats.totalOrders ?? 0}</strong>
                <small className="text-muted">{stats.totalCustomers ?? 0} registered customers</small>
              </div>
            </div>

            <div className="card kpi-card">
              <div className="kpi-icon kpi-emerald">
                <IndianRupee size={22} />
              </div>
              <div>
                <span className="kpi-label">Total Revenue</span>
                <strong className="kpi-value">{formatINR(stats.totalRevenue ?? 0)}</strong>
                <small className="text-muted">Excludes cancelled orders</small>
              </div>
            </div>

            <div className="card kpi-card">
              <div className="kpi-icon kpi-blue">
                <Truck size={22} />
              </div>
              <div>
                <span className="kpi-label">Today&apos;s Deliveries</span>
                <strong className="kpi-value">{stats.todaysDeliveries ?? 0}</strong>
                <small className="text-muted">IST Date: {stats.todayIST}</small>
              </div>
            </div>

            <div className="card kpi-card">
              <div className="kpi-icon kpi-amber">
                <AlertTriangle size={22} />
              </div>
              <div>
                <span className="kpi-label">Low Stock Alerts</span>
                <strong className="kpi-value">{stats.lowStockCount ?? 0}</strong>
                <small className="text-muted">Out of {stats.totalProducts ?? 0} catalog SKUs</small>
              </div>
            </div>
          </div>

          {/* Slot Utilization Charts powered by Python FastAPI Engine */}
          <div className="charts-grid">
            <div className="card chart-card-lg">
              <div className="card-header-row">
                <div>
                  <h3>7-Day Slot Utilization (Python Slot Engine)</h3>
                  <p className="text-muted">
                    {analytics
                      ? `${analytics.summary.total_booked} booked / ${analytics.summary.total_capacity} total slots (${analytics.summary.overall_utilization_pct}% utilized)`
                      : 'Live telemetry from FastAPI microservice'}
                  </p>
                </div>
                <div className="chart-controls">
                  <select
                    value={pincodeFilter}
                    onChange={(e) => setPincodeFilter(e.target.value)}
                    aria-label="Filter by pincode"
                  >
                    <option value="">All Pincodes</option>
                    <option value="302001">302001 (Jaipur Central)</option>
                    <option value="302017">302017 (Jaipur South)</option>
                    <option value="324001">324001 (Kota)</option>
                  </select>
                  <button
                    type="button"
                    className="btn btn-outline btn-xs"
                    onClick={fetchDashboard}
                    title="Refresh charts"
                  >
                    <RefreshCw size={14} />
                  </button>
                </div>
              </div>

              {!data?.slotServiceAvailable || !dayBarData ? (
                <div className="alert alert-warning">
                  Python Slot Engine is currently unreachable. Charts will appear automatically once
                  the service reconnects.
                </div>
              ) : (
                <div className="chart-container">
                  <Bar
                    data={dayBarData}
                    options={{
                      responsive: true,
                      maintainAspectRatio: false,
                      plugins: {
                        legend: { position: 'top' },
                      },
                      scales: {
                        x: { stacked: true },
                        y: { stacked: true, beginAtZero: true },
                      },
                    }}
                  />
                </div>
              )}
            </div>

            <div className="card chart-card-sm">
              <h3>Demand by 2-Hour Window</h3>
              <p className="text-muted" style={{ marginBottom: '1rem' }}>
                {analytics?.summary?.peak_slot_label
                  ? `Peak window: ${analytics.summary.peak_slot_label}`
                  : 'Distribution across 5 daily IST slots'}
              </p>

              {analytics && slotDoughnutData ? (
                <>
                  <div className="chart-container-sm">
                    <Doughnut
                      data={slotDoughnutData}
                      options={{
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                          legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } },
                        },
                      }}
                    />
                  </div>
                  <div className="slot-stat-pills">
                    <span className="badge badge-amber">
                      Filling Fast: {analytics.summary.filling_fast_count}
                    </span>
                    <span className="badge badge-danger">
                      Full Slots: {analytics.summary.full_slots_count}
                    </span>
                  </div>
                </>
              ) : (
                <p className="text-muted">No slot data available.</p>
              )}
            </div>
          </div>

          {/* Recent Orders Table */}
          <div className="card">
            <div className="card-header-row">
              <h3>Recent Orders</h3>
              <Link to="/admin/orders" className="text-link">
                Manage all orders &rarr;
              </Link>
            </div>
            <div className="table-responsive">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Order #</th>
                    <th>Customer</th>
                    <th>Delivery Slot</th>
                    <th>Pincode</th>
                    <th>Partner</th>
                    <th>Total</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.recentOrders || []).map((ord) => (
                    <tr key={ord._id}>
                      <td>
                        <strong>{ord.orderNumber}</strong>
                      </td>
                      <td>
                        <div>{ord.userId?.name || ord.shippingAddress?.fullName}</div>
                        <small className="text-muted">{ord.userId?.email}</small>
                      </td>
                      <td>
                        <div className="slot-cell">
                          <Clock size={13} /> {ord.slotDate} ({ord.slotLabel})
                        </div>
                      </td>
                      <td>{ord.pincode}</td>
                      <td>{ord.deliveryPartnerId?.name || <span className="text-muted">Unassigned</span>}</td>
                      <td>
                        <strong>{formatINR(ord.totals?.total)}</strong>
                      </td>
                      <td>
                        <span className={getStatusBadgeClass(ord.status)}>{ord.status}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
