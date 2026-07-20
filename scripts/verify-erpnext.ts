import assert from "node:assert/strict";
import http from "node:http";

const requests: URL[] = [];

function json(res: http.ServerResponse, value: unknown, statusCode = 200) {
  res.writeHead(statusCode, { "Content-Type": "application/json" });
  res.end(JSON.stringify(value));
}

function resourceRows(doctype: string) {
  if (doctype === "Sales Invoice") return [
    { name: "SINV-0002", posting_date: "2026-06-20", due_date: "2026-07-20", customer: "客户B", company: "XJD", grand_total: 800, paid_amount: 300, outstanding_amount: 500, status: "Partly Paid", currency: "CNY", docstatus: 1 },
    { name: "SINV-0001", posting_date: "2026-06-10", due_date: "2026-06-30", customer: "客户A", company: "XJD", grand_total: 1000, paid_amount: 1000, outstanding_amount: 0, status: "Paid", currency: "CNY", docstatus: 1 }
  ];
  if (doctype === "Purchase Invoice") return [
    { name: "PINV-0001", posting_date: "2026-06-12", due_date: "2026-07-12", supplier: "供应商A", company: "XJD", grand_total: 600, paid_amount: 200, outstanding_amount: 400, status: "Partly Paid", currency: "CNY", docstatus: 1 }
  ];
  if (doctype === "Payment Entry") return [
    { name: "ACC-PAY-0001", posting_date: "2026-06-21", payment_type: "Receive", party_type: "Customer", party: "客户B", paid_amount: 300, received_amount: 300, unallocated_amount: 0, reference_no: "BANK-001", docstatus: 1 }
  ];
  if (doctype === "Customer") return [
    { name: "CUST-001", customer_name: "客户A", customer_type: "Company", customer_group: "商业客户", territory: "中国", disabled: 0 }
  ];
  if (doctype === "Supplier") return [
    { name: "SUP-001", supplier_name: "供应商A", supplier_group: "物流供应商", country: "China", disabled: 0 }
  ];
  return [];
}

const mock = http.createServer((req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host}`);
  requests.push(url);
  assert.equal(req.headers.authorization, "token test-key:test-secret");

  if (url.pathname === "/api/method/frappe.auth.get_logged_user") {
    json(res, { message: "xjd-api@example.com" });
    return;
  }
  if (url.pathname === "/api/method/frappe.client.get_count") {
    const doctype = url.searchParams.get("doctype");
    const filters = url.searchParams.get("filters") || "";
    const outstanding = filters.includes("outstanding_amount");
    const counts: Record<string, number> = {
      Customer: 3,
      Supplier: 2,
      "Sales Invoice": outstanding ? 1 : 5,
      "Purchase Invoice": outstanding ? 1 : 4,
      "Payment Entry": 2
    };
    json(res, { message: counts[String(doctype)] ?? 0 });
    return;
  }
  if (url.pathname.startsWith("/api/resource/")) {
    const doctype = decodeURIComponent(url.pathname.slice("/api/resource/".length));
    const limit = Number(url.searchParams.get("limit_page_length") || 20);
    json(res, { data: resourceRows(doctype).slice(0, limit) });
    return;
  }
  json(res, { exc_type: "NotFound" }, 404);
});

async function main() {
  await new Promise<void>((resolve) => mock.listen(0, "127.0.0.1", resolve));
  const address = mock.address();
  assert(address && typeof address === "object");
  process.env.ERPNEXT_BASE_URL = `http://127.0.0.1:${address.port}`;
  process.env.ERPNEXT_API_KEY = "test-key";
  process.env.ERPNEXT_API_SECRET = "test-secret";
  process.env.ERPNEXT_TIMEOUT_MS = "3000";

  try {
    const service = await import("../server/src/services/erpnext.service.js");
    const status = service.getErpnextStatus();
    assert.equal(status.configured, true);
    assert.equal(status.readOnly, true);
    assert(status.supportedResources.includes("Payment Entry"));

    const connection = await service.testErpnextConnection();
    assert.equal(connection.remoteUser, "xjd-api@example.com");

    const overview = await service.getErpnextOverview({ fromDate: "2026-06-01", toDate: "2026-06-30" });
    assert.equal(overview.counts.customerCount, 3);
    assert.equal(overview.counts.salesInvoiceCount, 5);
    assert.equal(overview.counts.outstandingSalesInvoiceCount, 1);
    assert.equal(overview.payments[0].name, "ACC-PAY-0001");

    const invoices = await service.getErpnextInvoices({ kind: "sales", status: "outstanding", keyword: "客户", page: 1, pageSize: 1, fromDate: "2026-06-01", toDate: "2026-06-30" });
    assert.equal(invoices.rows.length, 1);
    assert.equal(invoices.hasMore, true);
    assert.equal(invoices.rows[0].name, "SINV-0002");

    const payments = await service.getErpnextPayments({ paymentType: "receive", pageSize: 20, fromDate: "2026-06-01", toDate: "2026-06-30" });
    assert.equal(payments.rows[0].payment_type, "Receive");

    const suppliers = await service.getErpnextParties({ kind: "supplier", keyword: "供应商" });
    assert.equal(suppliers.rows[0].supplier_name, "供应商A");

    await assert.rejects(
      () => service.getErpnextInvoices({ fromDate: "2026/06/01" }),
      (error: any) => error?.code === "ERPNEXT_QUERY_INVALID"
    );

    const invoiceRequest = requests.find((url) => decodeURIComponent(url.pathname).endsWith("Sales Invoice") && url.searchParams.get("filters")?.includes("outstanding_amount"));
    assert(invoiceRequest, "ERPNext invoice filters were not forwarded");
    assert(invoiceRequest.searchParams.get("or_filters")?.includes("customer"));
    console.log("ERPNext read-only connector checks passed.");
  } finally {
    await new Promise<void>((resolve, reject) => mock.close((error) => error ? reject(error) : resolve()));
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
