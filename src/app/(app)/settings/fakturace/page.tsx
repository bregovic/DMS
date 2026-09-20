import { requireUser } from "@/lib/dal";
import { prisma } from "@/lib/prisma";
import { SettingsNav } from "@/components/account/settings-nav";
import { BillingForm } from "@/components/account/billing-form";

/** Fakturační a daňové údaje (faktury za vykázanou práci, XML kontrolního hlášení). */
export default async function BillingSettingsPage() {
  const user = await requireUser();
  const b = await prisma.user.findUnique({
    where: { id: user.id },
    select: {
      billingName: true,
      billingIco: true,
      billingDic: true,
      billingAddress: true,
      billingAccount: true,
      vatPayer: true,
      taxSubjectType: true,
      firstName: true,
      lastName: true,
      street: true,
      houseNo: true,
      orientNo: true,
      city: true,
      zip: true,
      country: true,
      phone: true,
      dataBoxId: true,
      taxOfficeCode: true,
      taxOfficeDataBox: true,
      isdsLogin: true,
      isdsPassword: true,
      isdsTest: true,
      taxOfficeBranch: true,
    },
  });
  return (
    <div className="mx-auto max-w-3xl">
      <header className="mb-4">
        <h1 className="display text-4xl text-stone-950">Nastavení</h1>
      </header>
      <SettingsNav />
      <div className="mt-6">
        <BillingForm
          b={{
            billingName: b?.billingName ?? null,
            billingIco: b?.billingIco ?? null,
            billingDic: b?.billingDic ?? null,
            billingAddress: b?.billingAddress ?? null,
            billingAccount: b?.billingAccount ?? null,
            vatPayer: b?.vatPayer ?? false,
            taxSubjectType: b?.taxSubjectType ?? null,
            firstName: b?.firstName ?? null,
            lastName: b?.lastName ?? null,
            street: b?.street ?? null,
            houseNo: b?.houseNo ?? null,
            orientNo: b?.orientNo ?? null,
            city: b?.city ?? null,
            zip: b?.zip ?? null,
            country: b?.country ?? null,
            phone: b?.phone ?? null,
            dataBoxId: b?.dataBoxId ?? null,
            taxOfficeCode: b?.taxOfficeCode ?? null,
            taxOfficeDataBox: b?.taxOfficeDataBox ?? null,
            isdsLogin: b?.isdsLogin ?? null,
            isdsPasswordSet: !!b?.isdsPassword,
            isdsTest: b?.isdsTest ?? false,
            taxOfficeBranch: b?.taxOfficeBranch ?? null,
          }}
        />
      </div>
    </div>
  );
}
