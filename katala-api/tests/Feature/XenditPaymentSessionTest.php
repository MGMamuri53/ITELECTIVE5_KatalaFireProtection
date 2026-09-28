<?php

namespace Tests\Feature;

use App\Models\XenditPaymentSession;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class XenditPaymentSessionTest extends TestCase
{
    use RefreshDatabase;

    public function test_it_creates_a_xendit_payment_session(): void
    {
        config([
            'xendit.secret_key' => 'xnd_development_test_key',
            'xendit.success_return_url' => 'https://katala.test/payments/success',
            'xendit.cancel_return_url' => 'https://katala.test/payments/cancel',
        ]);

        Http::fake([
            'https://api.xendit.co/sessions' => Http::response([
                'payment_session_id' => 'ps-661f87c614802d6c402cd82d',
                'reference_id' => 'QUOTE-1001',
                'status' => 'ACTIVE',
                'payment_link_url' => 'https://checkout-staging.xendit.co/sessions/ps-661f87c614802d6c402cd82d',
            ], 201),
        ]);

        $response = $this->postJson('/api/xendit/payment-sessions', [
            'reference_id' => 'QUOTE-1001',
            'amount' => 10000,
            'description' => 'Katala quotation QUOTE-1001',
            'customer' => [
                'reference_id' => 'USER-1001',
                'email' => 'customer@example.com',
                'given_names' => 'Juan',
            ],
        ]);

        $response
            ->assertCreated()
            ->assertJsonPath('payment_link_url', 'https://checkout-staging.xendit.co/sessions/ps-661f87c614802d6c402cd82d');

        $this->assertDatabaseHas('xendit_payment_sessions', [
            'reference_id' => 'QUOTE-1001',
            'amount' => 10000,
            'status' => 'ACTIVE',
            'payment_session_id' => 'ps-661f87c614802d6c402cd82d',
        ]);
    }

    public function test_webhook_requires_the_xendit_callback_token(): void
    {
        config(['xendit.webhook_token' => 'known-token']);

        $this->postJson('/api/xendit/webhook', [], ['x-callback-token' => 'wrong-token'])
            ->assertUnauthorized();
    }

    public function test_webhook_updates_payment_status(): void
    {
        config(['xendit.webhook_token' => 'known-token']);

        XenditPaymentSession::create([
            'reference_id' => 'QUOTE-1002',
            'amount' => 10000,
            'status' => 'ACTIVE',
        ]);

        $this->postJson('/api/xendit/webhook', [
            'event' => 'payment_session.completed',
            'data' => [
                'payment_session_id' => 'ps-661f87c614802d6c402cd82e',
                'reference_id' => 'QUOTE-1002',
                'status' => 'COMPLETED',
                'amount' => 10000,
                'currency' => 'PHP',
                'country' => 'PH',
                'payment_link_url' => 'https://xen.to/kGxPCi60',
                'payment_request_id' => 'pr-0800fe40-bb79-47ae-9d1e-e69394d3949c',
                'payment_id' => 'py-ac1fcd3e-21c5-4c70-bb06-fa3c34e19e0c',
            ],
        ], ['x-callback-token' => 'known-token'])->assertOk();

        $this->assertDatabaseHas('xendit_payment_sessions', [
            'reference_id' => 'QUOTE-1002',
            'status' => 'COMPLETED',
            'payment_request_id' => 'pr-0800fe40-bb79-47ae-9d1e-e69394d3949c',
            'payment_id' => 'py-ac1fcd3e-21c5-4c70-bb06-fa3c34e19e0c',
        ]);
    }
}
