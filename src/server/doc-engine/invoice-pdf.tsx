import { Document, Image, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import type { Invoice } from "@/server/db/repositories/invoices.repository";
import type { InvoiceLineItem } from "./invoice.schema";
import { computeLineTotal, formatMoney } from "./money";

/**
 * The branded Invoice PDF (Story 5.3) — a server-side `@react-pdf/renderer` document that MIRRORS
 * the on-screen `src/components/invoice/invoice-document.tsx` (serif title, Tenant accent + logo as
 * the "from", `numeric` money). react-pdf has its own primitives, so this is a sibling render, NOT
 * the HTML component reused. Fonts = the standard PDF-14 only (Times serif title, Helvetica body,
 * Courier for the tabular amounts) — no `Font.register`, so there is no font-file/network dependency
 * at render time. Every amount goes through `formatMoney`/`computeLineTotal` — the SAME helpers the
 * HTML doc uses, so the PDF and the screen can never disagree (integer minor units, no float math).
 */
export type InvoicePdfData = {
  invoice: Invoice;
  clientName: string;
  tenantName: string;
  logoUrl: string | null;
  accentHex: string;
};

function fmtDate(d: Date | string): string {
  return new Date(d).toISOString().slice(0, 10); // YYYY-MM-DD (stable, locale-agnostic) — matches InvoiceDocument
}

const styles = StyleSheet.create({
  page: { fontFamily: "Helvetica", fontSize: 10, color: "#1c1b1f" },
  accentBar: { height: 6 }, // full-bleed (the page has no padding); backgroundColor set inline from accentHex
  content: { padding: 48, flexDirection: "column", gap: 24 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  logo: { height: 28, maxWidth: 160, objectFit: "contain" },
  tenantName: { fontFamily: "Times-Bold", fontSize: 16 },
  headerRight: { alignItems: "flex-end" },
  title: { fontFamily: "Times-Bold", fontSize: 20 },
  status: { fontSize: 9, color: "#52525b", textTransform: "uppercase", marginTop: 4 },
  metaRow: { flexDirection: "row", justifyContent: "space-between" },
  metaRight: { alignItems: "flex-end" },
  label: { fontSize: 8, color: "#71717a", textTransform: "uppercase", marginBottom: 3 },
  value: { fontSize: 10 },
  mono: { fontFamily: "Courier" },
  th: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#e7e5e0", paddingBottom: 6, marginBottom: 4 },
  tr: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#f0efec", paddingVertical: 5 },
  colDesc: { flex: 1, paddingRight: 8 },
  colNum: { width: 92, textAlign: "right" },
  totalRow: { flexDirection: "row", justifyContent: "flex-end", alignItems: "center", marginTop: 4 },
  totalLabel: { fontSize: 10, color: "#52525b", marginRight: 16 },
  totalValue: { fontFamily: "Courier", fontSize: 14 },
  notes: { borderTopWidth: 1, borderTopColor: "#e7e5e0", paddingTop: 12 },
  notesText: { fontSize: 9, color: "#52525b", lineHeight: 1.5 },
});

export function InvoicePdfDocument({ invoice, clientName, tenantName, logoUrl, accentHex }: InvoicePdfData) {
  const lineItems = (invoice.lineItems as InvoiceLineItem[]) ?? [];
  const statusLabel = invoice.status.charAt(0).toUpperCase() + invoice.status.slice(1);
  return (
    <Document title={`Invoice #${invoice.number}`} author={tenantName}>
      <Page size="A4" style={styles.page}>
        {/* The Tenant accent as a full-bleed top bar — the document's brand cue. */}
        <View style={[styles.accentBar, { backgroundColor: accentHex }]} />
        <View style={styles.content}>
          {/* Header: the Tenant "from" + the invoice number/status. */}
          <View style={styles.header}>
            <View>
              {logoUrl ? (
                // eslint-disable-next-line jsx-a11y/alt-text -- @react-pdf/renderer <Image> is a PDF primitive, not an HTML <img> (no alt concept)
                <Image src={logoUrl} style={styles.logo} />
              ) : (
                <Text style={styles.tenantName}>{tenantName}</Text>
              )}
            </View>
            <View style={styles.headerRight}>
              <Text style={styles.title}>Invoice #{invoice.number}</Text>
              <Text style={styles.status}>{statusLabel}</Text>
            </View>
          </View>

          {/* Bill-to + dates. */}
          <View style={styles.metaRow}>
            <View>
              <Text style={styles.label}>Bill to</Text>
              <Text style={styles.value}>{clientName}</Text>
            </View>
            <View style={styles.metaRight}>
              <Text style={[styles.value, styles.mono]}>Issued {fmtDate(invoice.issuedAt)}</Text>
              {invoice.dueAt ? <Text style={[styles.value, styles.mono]}>Due {fmtDate(invoice.dueAt)}</Text> : null}
            </View>
          </View>

          {/* Line items. */}
          <View>
            <View style={styles.th}>
              <Text style={[styles.label, styles.colDesc]}>Description</Text>
              <Text style={[styles.label, styles.colNum]}>Qty</Text>
              <Text style={[styles.label, styles.colNum]}>Unit</Text>
              <Text style={[styles.label, styles.colNum]}>Amount</Text>
            </View>
            {lineItems.map((item, i) => (
              <View style={styles.tr} key={i}>
                <Text style={styles.colDesc}>{item.description}</Text>
                <Text style={[styles.colNum, styles.mono]}>{String(item.quantity)}</Text>
                <Text style={[styles.colNum, styles.mono]}>{formatMoney(item.unitAmount, invoice.currency)}</Text>
                <Text style={[styles.colNum, styles.mono]}>{formatMoney(computeLineTotal(item), invoice.currency)}</Text>
              </View>
            ))}
          </View>

          {/* Total — prominent, Courier (tabular). */}
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Total</Text>
            <Text style={styles.totalValue}>{formatMoney(invoice.amountTotal, invoice.currency)}</Text>
          </View>

          {invoice.notes ? (
            <View style={styles.notes}>
              <Text style={styles.label}>Notes</Text>
              <Text style={styles.notesText}>{invoice.notes}</Text>
            </View>
          ) : null}
        </View>
      </Page>
    </Document>
  );
}

/** Render the branded Invoice PDF to a Node Buffer (server-side; the route/storage layer stores it). */
export async function renderInvoicePdf(data: InvoicePdfData): Promise<Buffer> {
  return renderToBuffer(<InvoicePdfDocument {...data} />);
}
