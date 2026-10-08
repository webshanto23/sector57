import { localDigits, pickContent, type Locale, type SiteInfo } from "@s57/shared";
import { getTranslations } from "next-intl/server";
import { Kantha } from "@/components/kit";

/** Mockup `.site-foot`: green band with address, office hours and contact, closed by the kantha stitch. */
export async function SiteFooter({ name, info, locale }: { name: string; info: SiteInfo | null; locale: Locale }) {
  const t = await getTranslations("Site.footer");
  const site = info ? pickContent(info, locale) : null;

  return (
    <footer className="mt-8 bg-primary text-primary-foreground">
      <div className="mx-auto grid max-w-[1180px] grid-cols-[repeat(auto-fit,minmax(min(220px,100%),1fr))] gap-4 px-4 py-[22px] text-[13.5px] [&_p]:opacity-[.88]">
        <div>
          <h4 className="mb-1">{name}</h4>
          {site ? <p>{site.address}</p> : null}
        </div>
        {site ? (
          <>
            <div>
              <h4 className="mb-1">{t("officeHours")}</h4>
              <p>{site.officeHours}</p>
            </div>
            <div>
              <h4 className="mb-1">{t("contact")}</h4>
              <p>
                <a href={`tel:${site.phone.replace(/[^\d+]/g, "")}`} className="text-inherit no-underline">
                  {localDigits(site.phone, locale)}
                </a>
                {site.email ? (
                  <>
                    {" · "}
                    <a href={`mailto:${site.email}`} className="text-inherit no-underline">
                      {site.email}
                    </a>
                  </>
                ) : null}
              </p>
            </div>
          </>
        ) : null}
      </div>
      <Kantha className="opacity-90" />
    </footer>
  );
}
