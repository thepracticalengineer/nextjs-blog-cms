export const articleContent = `<h2>Test behavior at service boundaries</h2>
<p>A reliable integration test begins with a clear contract. Identify the input your service accepts, the observable result it promises, and the failures callers can reasonably encounter. Prefer examples drawn from actual production workflows rather than assertions about private implementation details.</p>
<p>Consider an order service that reserves inventory and requests payment. The happy path should create one reservation and one payment request. A retry using the same idempotency key must return the existing order without charging the customer again. This behavior deserves an integration test because it crosses storage and network boundaries.</p>
<p>Keep the database real in a dedicated test environment. Replace the payment provider with a deterministic local stub that can simulate timeouts, declines, and successful responses. Verify the resulting order state and recorded requests. Avoid relying on timing alone: wait for an explicit completion signal with a bounded deadline.</p>
<p>Test failure recovery separately. If payment times out after the provider accepted the request, retry with the original key. If inventory is unavailable, confirm that no payment request is made. These examples reveal whether the system protects customers during partial failures.</p>
<p>Each test should own its data and clean it up reliably. Use unique identifiers, independent transactions where appropriate, and teardown that also runs after failed assertions. Never point this suite at production credentials. Finally, measure which failures these tests catch during development. A small set of realistic contract tests often provides more confidence than hundreds of assertions that merely repeat the implementation.</p>`

export const readyArticle = {
  title: 'Integration Testing at Service Boundaries',
  slug: 'integration-testing-service-boundaries',
  content: articleContent,
  excerpt: 'Design integration tests that verify service contracts, idempotent retries, and recovery from partial failures.',
  meta_title: 'Integration Testing at Service Boundaries',
  meta_description: 'Practical contract tests for reliable engineering systems.',
}
