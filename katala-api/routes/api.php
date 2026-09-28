<?php

use App\Http\Controllers\XenditPaymentController;
use Illuminate\Support\Facades\Route;

Route::post('/xendit/payment-sessions', [XenditPaymentController::class, 'createSession']);
Route::post('/xendit/webhook', [XenditPaymentController::class, 'webhook']);
