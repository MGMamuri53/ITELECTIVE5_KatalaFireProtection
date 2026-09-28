<?php

namespace App\Http\Controllers;

use App\Models\XenditPaymentSession;
use App\Services\XenditPaymentSessionClient;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Arr;
use RuntimeException;

class XenditPaymentController extends Controller
{
    public function createSession(Request $request, XenditPaymentSessionClient $xendit): JsonResponse
    {
        $validated = $request->validate([
            'reference_id' => ['required', 'string', 'max:64'],
            'amount' => ['required', 'integer', 'min:1'],
            'description' => ['required', 'string', 'max:1000'],
            'customer.reference_id' => ['required', 'string', 'max:64'],
            'customer.email' => ['required', 'email'],
            'customer.given_names' => ['required', 'string', 'max:255'],
            'customer.surname' => ['nullable', 'string', 'max:255'],
            'customer.mobile_number' => ['nullable', 'string', 'max:32'],
            'items' => ['nullable', 'array'],
            'items.*.reference_id' => ['required_with:items', 'string', 'max:255'],
            'items.*.name' => ['required_with:items', 'string', 'max:255'],
            'items.*.category' => ['required_with:items', 'string', 'max:255'],
            'items.*.net_unit_amount' => ['required_with:items', 'integer', 'min:1'],
            'items.*.quantity' => ['required_with:items', 'integer', 'min:1'],
        ]);

        if (! config('xendit.success_return_url') || ! config('xendit.cancel_return_url')) {
            return response()->json([
                'message' => 'Xendit return URLs are not configured. Set HTTPS XENDIT_SUCCESS_RETURN_URL and XENDIT_CANCEL_RETURN_URL.',
            ], 422);
        }

        $payload = [
            'reference_id' => $validated['reference_id'],
            'session_type' => 'PAY',
            'mode' => 'PAYMENT_LINK',
            'amount' => $validated['amount'],
            'currency' => config('xendit.currency'),
            'country' => config('xendit.country'),
            'customer' => [
                'reference_id' => Arr::get($validated, 'customer.reference_id'),
                'type' => 'INDIVIDUAL',
                'email' => Arr::get($validated, 'customer.email'),
                'mobile_number' => Arr::get($validated, 'customer.mobile_number'),
                'individual_detail' => [
                    'given_names' => Arr::get($validated, 'customer.given_names'),
                    'surname' => Arr::get($validated, 'customer.surname', ''),
                ],
            ],
            'items' => $this->items($validated),
            'capture_method' => 'AUTOMATIC',
            'locale' => 'en',
            'description' => $validated['description'],
            'success_return_url' => config('xendit.success_return_url'),
            'cancel_return_url' => config('xendit.cancel_return_url'),
            'metadata' => [
                'reference_id' => $validated['reference_id'],
            ],
        ];

        if (empty($payload['customer']['mobile_number'])) {
            unset($payload['customer']['mobile_number']);
        }

        if (empty($payload['customer']['individual_detail']['surname'])) {
            unset($payload['customer']['individual_detail']['surname']);
        }

        try {
            $response = $xendit->create($payload);
        } catch (RuntimeException $error) {
            $status = $error->getMessage() === 'XENDIT_NOT_CONFIGURED' ? 503 : 502;

            return response()->json(['message' => $error->getMessage()], $status);
        }

        $data = $response['data'] ?? $response;
        $session = XenditPaymentSession::updateOrCreate(
            ['reference_id' => $validated['reference_id']],
            [
                'amount' => $validated['amount'],
                'currency' => config('xendit.currency'),
                'country' => config('xendit.country'),
                'status' => $data['status'] ?? 'PENDING',
                'payment_session_id' => $data['payment_session_id'] ?? $data['id'] ?? null,
                'payment_request_id' => $data['payment_request_id'] ?? null,
                'payment_id' => $data['payment_id'] ?? null,
                'payment_link_url' => $data['payment_link_url'] ?? null,
                'raw_response' => $response,
            ],
        );

        return response()->json([
            'reference_id' => $session->reference_id,
            'status' => $session->status,
            'payment_link_url' => $session->payment_link_url,
        ], 201);
    }

    public function webhook(Request $request): JsonResponse
    {
        $expectedToken = config('xendit.webhook_token');

        if (! $expectedToken || ! hash_equals($expectedToken, (string) $request->header('x-callback-token'))) {
            return response()->json(['message' => 'Unauthorized webhook.'], 401);
        }

        $payload = $request->all();
        $data = $payload['data'] ?? [];
        $referenceId = $data['reference_id'] ?? null;

        if (! $referenceId) {
            return response()->json(['received' => true]);
        }

        XenditPaymentSession::updateOrCreate(
            ['reference_id' => $referenceId],
            [
                'amount' => (int) ($data['amount'] ?? 0),
                'currency' => $data['currency'] ?? config('xendit.currency'),
                'country' => $data['country'] ?? config('xendit.country'),
                'status' => $data['status'] ?? $payload['event'] ?? 'PENDING',
                'payment_session_id' => $data['payment_session_id'] ?? null,
                'payment_request_id' => $data['payment_request_id'] ?? null,
                'payment_id' => $data['payment_id'] ?? null,
                'payment_link_url' => $data['payment_link_url'] ?? null,
                'raw_webhook' => $payload,
            ],
        );

        return response()->json(['received' => true]);
    }

    private function items(array $validated): array
    {
        return collect($validated['items'] ?? [[
            'reference_id' => $validated['reference_id'],
            'name' => $validated['description'],
            'category' => 'SERVICE',
            'net_unit_amount' => $validated['amount'],
            'quantity' => 1,
        ]])->map(fn (array $item): array => [
            'reference_id' => $item['reference_id'],
            'type' => 'PHYSICAL_SERVICE',
            'name' => $item['name'],
            'category' => $item['category'],
            'net_unit_amount' => $item['net_unit_amount'],
            'quantity' => $item['quantity'],
            'currency' => config('xendit.currency'),
        ])->values()->all();
    }
}
