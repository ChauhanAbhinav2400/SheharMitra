import { ShopImage } from "@/components/shop-image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MapPin, Clock, ChevronRight, Store, Info } from "lucide-react";
import { publicApi, siteOrigin } from "@/lib/api";
import { publicMetadata } from "@/lib/seo";
import { Shop } from "@/lib/types";
import { Lang, translate } from "@/i18n";
import { brand } from "@/config/brand";
import { ShopActions } from "@/components/shop-actions";
export const dynamic = "force-dynamic";
export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: Lang; slug: string }>;
}) {
  const { lang, slug } = await params;
  const data = await publicApi<{ shop: Shop }>(
    `/shops/${encodeURIComponent(slug)}`,
  );
  if (!data)
    return { title: translate(lang, "not_found"), robots: { index: false } };
  const { shop } = data;
  return publicMetadata(
    lang,
    `/shops/${slug}`,
    `${shop.name[lang]} | ${translate(lang, shop.category)}, ${translate(lang, shop.town)} | ${brand.names[lang]}`,
    shop.description[lang],
  );
}
export default async function Page({
  params,
}: {
  params: Promise<{ lang: Lang; slug: string }>;
}) {
  const { lang, slug } = await params;
  const data = await publicApi<{ shop: Shop }>(
    `/shops/${encodeURIComponent(slug)}`,
  );
  if (!data) notFound();
  const { shop } = data,
    t = (k: string) => translate(lang, k);
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    name: shop.name[lang],
    description: shop.description[lang],
    image: new URL(shop.image, siteOrigin()).href,
    url: `${siteOrigin()}/${lang}/shops/${shop.slug}`,
    address: {
      "@type": "PostalAddress",
      addressLocality: shop.town,
      addressRegion: "Uttar Pradesh",
      addressCountry: "IN",
    },
  };
  return (
    <div className="container shop-detail">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c"),
        }}
      />
      <nav className="breadcrumbs">
        <Link href={`/${lang}`}>{t("marketplace")}</Link>
        <ChevronRight size={15} />
        <Link href={`/${lang}/towns/${shop.town}`}>{t(shop.town)}</Link>
        <ChevronRight size={15} />
        <span>{t(shop.category)}</span>
      </nav>
      <div className="detail-grid">
        <div>
          <div className="detail-image">
            <ShopImage
              src={shop.image}
              fill
              priority
              sizes="(max-width:767px) 100vw, 650px"
              alt={shop.name[lang]}
            />
          </div>
          {shop.image.startsWith("/shops/") && (
            <p className="small muted">{t("synthetic")}</p>
          )}
          <h2>{t("shop_about")}</h2>
          <p>{shop.description[lang]}</p>
          <h3>{t("indicative_items")}</h3>
          <div className="detail-products">
            {shop.items.map((item, i) => (
              <span className="chip" key={i}>
                {item[lang]}
              </span>
            ))}
          </div>
          <p className="notice soft">
            <Info size={20} />
            {t("availability_note")}
          </p>
        </div>
        <div className="detail-info">
          <span className="eyebrow">
            <Store size={17} />
            {t(shop.category)}
          </span>
          <h1>{shop.name[lang]}</h1>
          <p>
            {t("owner")} · <strong>{shop.ownerName}</strong>
          </p>
          <span className={`badge ${shop.closed ? "bad" : "good"}`}>
            {shop.closed ? t("closed") : t("open")}
          </span>
          <div className="panel">
            <p className="icon-line">
              <MapPin size={20} />
              <strong>{t("location")}</strong>
            </p>
            <p>{shop.locality[lang]}, {t(shop.town)}</p>
            <p className="icon-line">
              <Clock size={20} />
              <strong>{t("hours")}</strong>
            </p>
            <p>{shop.hours}</p>
          </div>
          <p className="small">{t("request_hint")}</p>
          <ShopActions shopId={shop.id} sellerId={shop.sellerId} closed={shop.closed} />
        </div>
      </div>
    </div>
  );
}
