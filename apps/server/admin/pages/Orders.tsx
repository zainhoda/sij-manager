import React, { useState, useEffect, useCallback } from "react";
import { Link } from "wouter";
import { Trash2 } from "lucide-react";
import DataGrid from "../components/DataGrid";
import type { Column, CellChangeContext } from "../components/DataGrid";

interface Product {
  id: number;
  name: string;
}

interface OrderWithProduct {
  id: number;
  product_id: number;
  product_name: string;
  quantity: number;
  due_date: string;
  status: "pending" | "scheduled" | "in_progress" | "completed";
  color: string | null;
  created_at: string;
  schedule_id: number | null;
}

interface AddOrderModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (order: OrderWithProduct) => void;
  products: Product[];
}

function AddOrderModal({ isOpen, onClose, onSuccess, products }: AddOrderModalProps) {
  const [formData, setFormData] = useState({
    product_id: "",
    quantity: 1,
    due_date: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      // Reset form and set default due date to 2 weeks from now
      const twoWeeksFromNow = new Date();
      twoWeeksFromNow.setDate(twoWeeksFromNow.getDate() + 14);
      setFormData({
        product_id: products[0]?.id.toString() || "",
        quantity: 1,
        due_date: twoWeeksFromNow.toISOString().split("T")[0]!,
      });
      setError(null);
    }
  }, [isOpen, products]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.product_id || !formData.due_date) {
      setError("Please fill in all required fields");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          product_id: parseInt(formData.product_id),
          quantity: formData.quantity,
          due_date: formData.due_date,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to create order");
      }

      const newOrder = await response.json();
      // Fetch the order with product_name
      const orderResponse = await fetch(`/api/orders/${newOrder.id}`);
      const orderWithProduct = await orderResponse.json();
      onSuccess({ ...orderWithProduct, schedule_id: null });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create order");
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-slate-900">Add New Order</h2>
          <button
            className="w-8 h-8 flex items-center justify-center rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-700 transition-colors text-xl"
            onClick={onClose}
          >
            &times;
          </button>
        </div>

        {error && <div className="error-banner">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="mb-5">
            <label htmlFor="product" className="block text-sm font-medium text-slate-700 mb-2">
              Product *
            </label>
            <select
              id="product"
              value={formData.product_id}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, product_id: e.target.value }))
              }
              required
              className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
            >
              <option value="">Select a product...</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          <div className="mb-5">
            <label htmlFor="quantity" className="block text-sm font-medium text-slate-700 mb-2">
              Quantity *
            </label>
            <input
              type="number"
              id="quantity"
              min="1"
              value={formData.quantity}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  quantity: parseInt(e.target.value) || 1,
                }))
              }
              required
              className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          <div className="mb-5">
            <label htmlFor="due_date" className="block text-sm font-medium text-slate-700 mb-2">
              Due Date *
            </label>
            <input
              type="date"
              id="due_date"
              value={formData.due_date}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, due_date: e.target.value }))
              }
              required
              className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          <div className="flex justify-end gap-3 pt-5 border-t border-slate-200 mt-6">
            <button
              type="button"
              className="px-4 py-2.5 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-50"
              onClick={onClose}
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
              disabled={loading}
            >
              {loading ? "Creating..." : "Create Order"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function Orders() {
  const [orders, setOrders] = useState<OrderWithProduct[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);

  const fetchOrders = useCallback(async () => {
    try {
      const response = await fetch("/api/orders");
      const data = await response.json();
      setOrders(data);
    } catch (error) {
      console.error("Failed to fetch orders:", error);
    }
  }, []);

  const fetchProducts = useCallback(async () => {
    try {
      const response = await fetch("/api/products");
      const data = await response.json();
      setProducts(data);
    } catch (error) {
      console.error("Failed to fetch products:", error);
    }
  }, []);

  useEffect(() => {
    Promise.all([fetchOrders(), fetchProducts()]).finally(() => setLoading(false));
  }, [fetchOrders, fetchProducts]);

  const handleCellChange = async ({
    rowId,
    key,
    value,
    row,
  }: CellChangeContext<OrderWithProduct>) => {
    // Store old value for rollback
    const oldOrder = orders.find((o) => o.id === rowId);
    if (!oldOrder) return;

    // Optimistic update
    setOrders((prev) =>
      prev.map((o) => (o.id === rowId ? { ...o, [key]: value } : o))
    );

    try {
      const response = await fetch(`/api/orders/${rowId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [key]: value }),
      });

      if (!response.ok) {
        throw new Error("Failed to update order");
      }

      // Update with server response (includes product_name if product_id changed)
      const updatedOrder = await response.json();
      setOrders((prev) =>
        prev.map((o) => (o.id === rowId ? updatedOrder : o))
      );
    } catch (error) {
      console.error("Failed to update order:", error);
      // Rollback on error
      setOrders((prev) =>
        prev.map((o) => (o.id === rowId ? oldOrder : o))
      );
    }
  };

  const handleDeleteOrder = async (orderId: number) => {
    if (!confirm("Are you sure you want to delete this order? This will also delete any associated schedules.")) {
      return;
    }

    try {
      const response = await fetch(`/api/orders/${orderId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to delete order");
      }

      setOrders((prev) => prev.filter((o) => o.id !== orderId));
    } catch (error) {
      console.error("Failed to delete order:", error);
      alert(error instanceof Error ? error.message : "Failed to delete order");
    }
  };

  const columns: Column<OrderWithProduct>[] = [
    {
      key: "id",
      header: "ID",
      width: 60,
      editable: false,
    },
    {
      key: "product_name",
      header: "Product",
      width: 180,
      editable: true,
      renderEdit: (value, onChange, onCommit, onCancel, row) => (
        <select
          className="cell-edit-select"
          value={row.product_id}
          onChange={async (e) => {
            const newProductId = parseInt(e.target.value);
            const newProduct = products.find((p) => p.id === newProductId);
            if (newProduct) {
              // Update product_id via API, which will return updated product_name
              await handleCellChange({
                rowId: row.id,
                key: "product_id",
                value: newProductId,
                row,
                column: { key: "product_id", header: "Product" },
              });
            }
            onCommit();
          }}
          onBlur={onCommit}
          onKeyDown={(e) => {
            if (e.key === "Escape") onCancel();
          }}
          autoFocus
        >
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      ),
    },
    {
      key: "quantity",
      header: "Qty",
      width: 80,
      editable: true,
      renderEdit: (value, onChange, onCommit, onCancel) => (
        <input
          type="number"
          className="cell-edit-input"
          value={value ?? ""}
          min="1"
          onChange={(e) => onChange(parseInt(e.target.value) || 1)}
          onBlur={onCommit}
          onKeyDown={(e) => {
            if (e.key === "Enter") onCommit();
            if (e.key === "Escape") onCancel();
          }}
          autoFocus
        />
      ),
    },
    {
      key: "due_date",
      header: "Due Date",
      width: 130,
      editable: true,
      render: (value) => {
        // Parse as local time to avoid timezone shift
        const [year, month, day] = String(value).split('-').map(Number);
        return new Date(year!, month! - 1, day!).toLocaleDateString();
      },
      renderEdit: (value, onChange, onCommit, onCancel) => (
        <input
          type="date"
          className="cell-edit-input"
          value={String(value)}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onCommit}
          onKeyDown={(e) => {
            if (e.key === "Enter") onCommit();
            if (e.key === "Escape") onCancel();
          }}
          autoFocus
        />
      ),
    },
    {
      key: "status",
      header: "Status",
      width: 120,
      editable: true,
      render: (value) => (
        <span className={`status-badge ${value}`}>
          {String(value).replace("_", " ")}
        </span>
      ),
      renderEdit: (value, onChange, onCommit, onCancel) => (
        <select
          className="cell-edit-select"
          value={String(value)}
          onChange={(e) =>
            onChange(e.target.value as OrderWithProduct["status"])
          }
          onBlur={onCommit}
          onKeyDown={(e) => {
            if (e.key === "Enter") onCommit();
            if (e.key === "Escape") onCancel();
          }}
          autoFocus
        >
          <option value="pending">pending</option>
          <option value="scheduled">scheduled</option>
          <option value="in_progress">in progress</option>
          <option value="completed">completed</option>
        </select>
      ),
    },
    {
      key: "color",
      header: "Color",
      width: 80,
      editable: true,
      render: (value) => (
        <div
          style={{
            width: 24,
            height: 24,
            borderRadius: 4,
            background: value ? String(value) : "#e2e8f0",
            border: "1px solid var(--border-color)",
          }}
        />
      ),
      renderEdit: (value, onChange, onCommit, onCancel) => (
        <input
          type="color"
          value={value ? String(value) : "#3B82F6"}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onCommit}
          style={{ width: "100%", height: 32, cursor: "pointer", border: "none" }}
          autoFocus
        />
      ),
    },
    {
      key: "created_at",
      header: "Created",
      width: 100,
      editable: false,
      render: (value) => new Date(String(value)).toLocaleDateString(),
    },
    {
      key: "id",
      header: "Actions",
      width: 200,
      editable: false,
      render: (value, row) => {
        return (
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {row.status === "pending" && (
              <Link
                href={`/orders/${row.id}/plan`}
                className="btn btn-primary"
                style={{ padding: "4px 8px", fontSize: 12, textDecoration: "none" }}
              >
                Create Plan
              </Link>
            )}
            {row.schedule_id && (
              <>
                <Link
                  href={`/schedules/${row.schedule_id}`}
                  className="btn btn-secondary"
                  style={{ padding: "4px 8px", fontSize: 12, textDecoration: "none" }}
                >
                  View Schedule
                </Link>
                <Link
                  href={`/orders/${row.id}/plan`}
                  className="btn btn-secondary"
                  style={{ padding: "4px 8px", fontSize: 12, textDecoration: "none" }}
                >
                  Replan
                </Link>
              </>
            )}
            <button
              className="btn btn-danger"
              style={{ padding: "4px 8px", fontSize: 12 }}
              onClick={() => handleDeleteOrder(row.id)}
              title="Delete order"
            >
              <Trash2 size={14} />
            </button>
          </div>
        );
      },
    },
  ];

  if (loading) {
    return (
      <div className="page">
        <h1>Orders</h1>
        <p>Loading...</p>
      </div>
    );
  }

  return (
    <div className="page">
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 16,
        }}
      >
        <h1>Orders</h1>
        <button className="btn btn-primary" onClick={() => setShowAddModal(true)}>
          Add Order
        </button>
      </div>
      <DataGrid
        data={orders}
        columns={columns}
        onCellChange={handleCellChange}
        searchPlaceholder="Search orders..."
        height="calc(100vh - 180px)"
      />
      <AddOrderModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        onSuccess={(newOrder) => setOrders((prev) => [...prev, newOrder])}
        products={products}
      />
    </div>
  );
}
