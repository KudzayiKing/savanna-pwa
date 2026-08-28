import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { SavannaShell } from "@/components/SavannaShell";
import { AnimatedShoppingBagIcon } from "@/components/AnimatedNavIcons";
import { startLogin } from "@/const";
import { trpc } from "@/lib/trpc";
import { ClipboardList, Loader2, PackageCheck, Store } from "lucide-react";
import { toast } from "sonner";
import { Link } from "wouter";

function formatPrice(minor: number, currency: string) {
  return new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: 2 }).format(minor / 100);
}

function StatusPill({ status }: { status: string }) {
  const labels: Record<string, string> = {
    awaiting_payment: "Awaiting payment",
    paid: "Paid",
    accepted: "Accepted",
    preparing: "Preparing",
    ready: "Ready",
    completed: "Completed",
    cancelled: "Cancelled",
    refunded: "Refunded",
  };
  const colors: Record<string, string> = {
    awaiting_payment: "savanna-order-status bg-[#FFFDF7] text-[#A87820]",
    paid: "savanna-order-status bg-[#FFFDF7] text-[#D9A441]",
    accepted: "savanna-order-status bg-[#FFFDF7] text-[#D9A441]",
    preparing: "savanna-order-status bg-[#FFFDF7] text-[#A87820]",
    ready: "savanna-order-status bg-[#FFFDF7] text-[#53BDEB]",
    completed: "savanna-order-status bg-[#FFFDF7] text-[#D9A441]",
    cancelled: "savanna-order-status bg-[#FFFDF7] text-[#FF5B6B]",
    refunded: "savanna-order-status bg-[#FFFDF7] text-[#FF5B6B]",
  };
  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${colors[status] ?? "savanna-order-status bg-[#FFFDF8] text-[#8a765d]"}`}>
      {labels[status] ?? status}
    </span>
  );
}

export default function OrdersPage() {
  const { isAuthenticated, loading } = useAuth();
  const utils = trpc.useUtils();
  const buyerOrders = trpc.commerce.orders.mine.useQuery(undefined, { enabled: isAuthenticated });
  const storefront = trpc.commerce.storefronts.mine.useQuery(undefined, { enabled: isAuthenticated });
  const merchantOrders = trpc.commerce.orders.merchantList.useQuery(
    { storefrontId: storefront.data?.storefront?.id ?? 0 },
    { enabled: Boolean(storefront.data?.storefront?.id) },
  );
  const updateStatus = trpc.commerce.orders.updateStatus.useMutation({
    onSuccess: () => {
      merchantOrders.refetch();
      utils.commerce.orders.mine.invalidate();
      toast.success("Order status updated");
    },
    onError: error => toast.error(error.message),
  });

  if (loading) {
    return (
      <SavannaShell>
        <div className="grid min-h-[60vh] place-items-center">
          <Loader2 className="size-6 animate-spin text-[#9a6410]" />
        </div>
      </SavannaShell>
    );
  }

  if (!isAuthenticated) {
    return (
      <SavannaShell>
        <section className="grid min-h-[62vh] place-items-center rounded-[30px] border border-[#eadfca] bg-white p-8 text-center">
          <div className="max-w-md">
            <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-[#f7e5bd] text-[#9a6410]">
              <ClipboardList className="size-6" />
            </span>
            <h1 className="mt-6 font-display text-4xl font-semibold tracking-[-0.06em] text-[#3d2d1a]">
              Keep every order clear.
            </h1>
            <p className="mt-4 text-sm leading-7 text-[#796b56]">
              Sign in to view purchases, payment status, receipts, and any updates from your sellers.
            </p>
            <Button onClick={() => startLogin()} className="mt-6 rounded-xl bg-[#5d3a0c] text-white hover:bg-[#412607]">
              Sign in to orders
            </Button>
          </div>
        </section>
      </SavannaShell>
    );
  }

  return (
    <SavannaShell>
      <div className="savanna-route-orders mx-auto max-w-[1050px] space-y-8">
        <header>
          <p className="savanna-route-eyebrow text-xs font-semibold uppercase tracking-[0.16em] text-[#9a6410]">Orders</p>
          <h1 className="mt-1 font-display text-4xl font-semibold tracking-[-0.06em] text-[#3d2d1a]">Every handover, clearly tracked.</h1>
          <p className="mt-3 text-sm leading-6 text-[#796b56]">Your receipt, payment confirmation, and seller updates are kept together.</p>
        </header>

        <section>
          <div className="mb-4 flex items-center gap-3">
            <span className="grid size-9 place-items-center rounded-xl bg-[#f7e5bd] text-[#9a6410]">
              <AnimatedShoppingBagIcon size={18} />
            </span>
            <div>
              <h2 className="font-display text-2xl font-semibold tracking-[-0.045em] text-[#3d2d1a]">Your purchases</h2>
              <p className="text-xs text-[#8a765d]">Orders you have placed with Savanna sellers.</p>
            </div>
          </div>

          {buyerOrders.isLoading ? (
            <div className="grid min-h-40 place-items-center">
              <Loader2 className="size-5 animate-spin text-[#9a6410]" />
            </div>
          ) : buyerOrders.data?.length ? (
            <div className="space-y-3">
              {buyerOrders.data.map(order => (
                <article
                  key={order.id}
                  className="flex flex-col justify-between gap-4 rounded-[22px] border border-[#eadfca] bg-white p-5 shadow-[0_8px_20px_rgba(94,58,11,0.03)] sm:flex-row sm:items-center"
                >
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-[#4a3824]">{order.orderReference}</p>
                      <StatusPill status={order.status} />
                    </div>
                    <p className="mt-1 text-xs text-[#8a765d]">Placed {new Date(order.createdAt).toLocaleString()}</p>
                    {order.status === "awaiting_payment" ? (
                      <p className="mt-3 text-sm text-[#80572c]">Payment confirmation is required before the seller can prepare this order.</p>
                    ) : null}
                  </div>
                  <div className="text-right">
                    <p className="savanna-order-amount text-lg font-semibold text-[#7b4a0d]">{formatPrice(order.totalMinor, order.currencyCode)}</p>
                    <p className="mt-1 text-xs text-[#8a765d]">Fees: {formatPrice(order.feeMinor, order.currencyCode)}</p>
                    {order.status === "awaiting_payment" ? (
                      <Link href={`/checkout/order/${order.id}`}>
                        <Button className="mt-3 rounded-xl bg-[#5d3a0c] text-white hover:bg-[#412607]">Pay now</Button>
                      </Link>
                    ) : null}
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="rounded-[24px] border border-dashed border-[#ead2a4] bg-[#fffaf0] p-7 text-sm text-[#8a765d]">
              You have not placed an order yet.
            </div>
          )}
        </section>

        {storefront.data?.storefront ? (
          <section>
            <div className="mb-4 flex items-center gap-3">
              <span className="grid size-9 place-items-center rounded-xl bg-[#f7e5bd] text-[#9a6410]">
                <Store className="size-4" />
              </span>
              <div>
                <h2 className="font-display text-2xl font-semibold tracking-[-0.045em] text-[#3d2d1a]">Merchant orders</h2>
                <p className="text-xs text-[#8a765d]">Update customers after payment is confirmed.</p>
              </div>
            </div>

            {merchantOrders.isLoading ? (
              <Loader2 className="size-5 animate-spin text-[#9a6410]" />
            ) : merchantOrders.data?.length ? (
              <div className="space-y-3">
                {merchantOrders.data.map(order => {
                  const nextStatus = order.status === "paid" ? "accepted" : "preparing";
                  const actionLabel = order.status === "paid" ? "Accept" : "Preparing";
                  return (
                    <article
                      key={order.id}
                      className="flex flex-col justify-between gap-4 rounded-[22px] border border-[#eadfca] bg-white p-5 shadow-[0_8px_20px_rgba(94,58,11,0.03)] lg:flex-row lg:items-center"
                    >
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-semibold text-[#4a3824]">{order.orderReference}</p>
                          <StatusPill status={order.status} />
                        </div>
                        <p className="mt-1 text-xs text-[#8a765d]">Customer order · {new Date(order.createdAt).toLocaleString()}</p>
                        <p className="savanna-order-amount mt-2 text-sm font-semibold text-[#7b4a0d]">{formatPrice(order.totalMinor, order.currencyCode)}</p>
                      </div>
                      {order.status === "awaiting_payment" ? (
                        <p className="text-sm text-[#80572c]">Waiting for partner payment confirmation</p>
                      ) : ["completed", "cancelled", "refunded"].includes(order.status) ? (
                        <PackageCheck className="size-6 text-[#9a6410]" />
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          <Button
                            disabled={updateStatus.isPending}
                            onClick={() => updateStatus.mutate({ orderId: order.id, status: nextStatus })}
                            variant="outline"
                            className="rounded-xl border-[#ead2a4] text-[#9a6410]"
                          >
                            {actionLabel}
                          </Button>
                          <Button
                            disabled={updateStatus.isPending}
                            onClick={() => updateStatus.mutate({ orderId: order.id, status: "ready" })}
                            className="rounded-xl bg-[#5d3a0c] text-white hover:bg-[#412607]"
                          >
                            Mark ready
                          </Button>
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-[24px] border border-dashed border-[#ead2a4] bg-[#fffaf0] p-7 text-sm text-[#8a765d]">
                Your storefront does not have customer orders yet.
              </div>
            )}
          </section>
        ) : null}
      </div>
    </SavannaShell>
  );
}
