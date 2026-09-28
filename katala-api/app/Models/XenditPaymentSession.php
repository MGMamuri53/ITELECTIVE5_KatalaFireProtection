<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class XenditPaymentSession extends Model
{
    protected $fillable = [
        'reference_id',
        'amount',
        'currency',
        'country',
        'status',
        'payment_session_id',
        'payment_request_id',
        'payment_id',
        'payment_link_url',
        'raw_response',
        'raw_webhook',
    ];

    protected function casts(): array
    {
        return [
            'raw_response' => 'array',
            'raw_webhook' => 'array',
        ];
    }
}
