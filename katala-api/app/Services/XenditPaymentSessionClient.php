<?php

namespace App\Services;

use Illuminate\Http\Client\PendingRequest;
use Illuminate\Support\Facades\Http;
use RuntimeException;

class XenditPaymentSessionClient
{
    public function create(array $payload): array
    {
        $secretKey = config('xendit.secret_key');

        if (! $secretKey) {
            throw new RuntimeException('XENDIT_NOT_CONFIGURED');
        }

        $response = $this->request()
            ->withBasicAuth($secretKey, '')
            ->post('/sessions', $payload);

        if ($response->failed()) {
            throw new RuntimeException($response->json('message') ?: 'XENDIT_API_ERROR');
        }

        return $response->json();
    }

    private function request(): PendingRequest
    {
        return Http::baseUrl(rtrim(config('xendit.base_url'), '/'))
            ->acceptJson()
            ->asJson()
            ->timeout(20);
    }
}
