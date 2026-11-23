"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { MessageCircle, Phone, Video, PackagePlus } from "lucide-react";
import { useApp } from "./provider";
import { Button, Modal } from "./ui";
import { AddressForm, emptyAddress } from "./address-form";
import { requestCall } from "./call-panel";
import { mutate } from "@/lib/api";
export function ShopActions({
  shopId,
  sellerId,
  closed,
}: {
  shopId: string;
  sellerId: string;
  closed: boolean;
}) {
  const { t, lang, user, error } = useApp(),
    router = useRouter();
  const [busy, setBusy] = useState(false),
    [order, setOrder] = useState(false),
    [address, setAddress] = useState(emptyAddress);
  async function chat(kind?: 'audio'|'video') {
    if (!user) {
      router.push(`/${lang}/login`);
      return;
    }
    if(kind){requestCall({shopId},kind);return;}
    setBusy(true);
    try {
      const d = await mutate("/conversations", { shopId });
      router.push(
        `/${lang}/messages/${d.conversation.id}${kind ? `?call=${kind}` : ""}`,
      );
    } catch (e) {
      error(e);
    } finally {
      setBusy(false);
    }
  }
  if (user?.id === sellerId) return (
    <div className="detail-actions">
      <p className="notice">{t("own_shop_notice")}</p>
      <Link className="button secondary block" href={`/${lang}/profile`}>{t("manage_shop_profile")}</Link>
    </div>
  );
  return (
    <div className="detail-actions">
      <div className="actions">
        <Button loading={busy} onClick={() => chat()}>
          <MessageCircle size={19} />
          {t("message_shop")}
        </Button>
        <Button variant="secondary" onClick={() => chat("audio")}>
          <Phone size={18} />
          {t("audio_call")}
        </Button>
        <Button variant="secondary" onClick={() => chat("video")}>
          <Video size={18} />
          {t("video_call")}
        </Button>
      </div>
      <Button
        className="block"
        variant="secondary"
        style={{ marginTop: 12 }}
        disabled={closed}
        onClick={() => {
          if (!user) router.push(`/${lang}/login`);
          else setOrder(true);
        }}
      >
        <PackagePlus size={19} />
        {t(closed ? "shop_closed" : "request_quote")}
      </Button>
      {order && (
        <Modal title={t("new_order")} onClose={() => setOrder(false)}>
          <form
            className="form-stack"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              try {
                const d = await mutate("/orders", {
                  shopId,
                  addressDetails: address,
                  locationId: address.locationId,
                });
                router.push(`/${lang}/orders/${d.order.id}`);
              } catch (e) {
                error(e);
              } finally {
                setBusy(false);
              }
            }}
          >
            <p>{t("new_order_hint")}</p>
            <AddressForm value={address} onChange={setAddress} label={t("delivery_address")}/>
            <Button loading={busy} type="submit">
              {t("request_quote")}
            </Button>
          </form>
        </Modal>
      )}
    </div>
  );
}
