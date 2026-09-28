<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('xendit_payment_sessions', function (Blueprint $table): void {
            $table->id();
            $table->string('reference_id', 64)->unique();
            $table->unsignedBigInteger('amount');
            $table->string('currency', 3)->default('PHP');
            $table->string('country', 2)->default('PH');
            $table->string('status', 24)->default('PENDING');
            $table->string('payment_session_id')->nullable()->index();
            $table->string('payment_request_id')->nullable()->index();
            $table->string('payment_id')->nullable()->index();
            $table->text('payment_link_url')->nullable();
            $table->json('raw_response')->nullable();
            $table->json('raw_webhook')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('xendit_payment_sessions');
    }
};
