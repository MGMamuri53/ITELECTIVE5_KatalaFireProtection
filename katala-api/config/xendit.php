<?php

return [
    'base_url' => env('XENDIT_BASE_URL', 'https://api.xendit.co'),
    'secret_key' => env('XENDIT_SECRET_KEY'),
    'webhook_token' => env('XENDIT_WEBHOOK_TOKEN'),
    'country' => env('XENDIT_COUNTRY', 'PH'),
    'currency' => env('XENDIT_CURRENCY', 'PHP'),
    'success_return_url' => env('XENDIT_SUCCESS_RETURN_URL'),
    'cancel_return_url' => env('XENDIT_CANCEL_RETURN_URL'),
];
