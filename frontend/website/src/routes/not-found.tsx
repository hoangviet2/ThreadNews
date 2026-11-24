import { EmptyState, buttonClass } from "@threadnews/shared/ui";
import { FileText } from "lucide-react";
import { Link } from "react-router";
import { Container, usePageTitle } from "../components/site-chrome";

export function NotFoundPage() {
  usePageTitle("Page not found");
  return (
    <Container className="max-w-xl! py-16">
      <EmptyState icon={FileText} action={<Link to="/" className={buttonClass("primary", "sm")}>Go to the home page</Link>}>
        We couldn't find that page.
      </EmptyState>
    </Container>
  );
}
