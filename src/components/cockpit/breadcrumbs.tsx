"use client";

import { Fragment } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { crumbsForPath } from "./nav-config";

export function Breadcrumbs() {
  const crumbs = crumbsForPath(usePathname());
  return (
    <Breadcrumb>
      <BreadcrumbList>
        <BreadcrumbItem className="hidden sm:block">
          <BreadcrumbLink asChild>
            <Link href="/app">Soloist</Link>
          </BreadcrumbLink>
        </BreadcrumbItem>
        {crumbs.map((c, i) => (
          <Fragment key={`${c.label}-${i}`}>
            <BreadcrumbSeparator className="hidden sm:block" />
            <BreadcrumbItem>
              {c.href ? (
                <BreadcrumbLink asChild>
                  <Link href={c.href}>{c.label}</Link>
                </BreadcrumbLink>
              ) : (
                <BreadcrumbPage>{c.label}</BreadcrumbPage>
              )}
            </BreadcrumbItem>
          </Fragment>
        ))}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
