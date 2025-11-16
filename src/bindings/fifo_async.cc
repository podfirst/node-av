#include "fifo.h"
#include <napi.h>

extern "C" {
#include <libavutil/fifo.h>
#include <libavutil/mem.h>
}

namespace ffmpeg {

class FifoWriteWorker : public Napi::AsyncWorker {
public:
  FifoWriteWorker(Napi::Env env, AVFifo* fifo, void* buf, size_t nb_elems)
    : AsyncWorker(env),
      fifo_(fifo),
      buf_(buf),
      nb_elems_(nb_elems),
      result_(0),
      deferred_(Napi::Promise::Deferred::New(env)) {
  }

  void Execute() override {
    // Null checks to prevent use-after-free crashes
    if (!fifo_) {
      result_ = AVERROR(EINVAL);
      return;
    }

    // Note: av_fifo_write returns 0 on success (not number of elements written) in FFmpeg 8.0+
    int ret = av_fifo_write(fifo_, buf_, nb_elems_);
    // Store number of elements written on success, or error code
    result_ = ret >= 0 ? static_cast<int>(nb_elems_) : ret;
  }

  void OnOK() override {
    deferred_.Resolve(Napi::Number::New(Env(), result_));
  }

  void OnError(const Napi::Error& error) override {
    deferred_.Reject(error.Value());
  }

  Napi::Promise GetPromise() { return deferred_.Promise(); }

private:
  AVFifo* fifo_;
  void* buf_;
  size_t nb_elems_;
  int result_;
  Napi::Promise::Deferred deferred_;
};

class FifoReadWorker : public Napi::AsyncWorker {
public:
  FifoReadWorker(Napi::Env env, AVFifo* fifo, void* buf, size_t nb_elems)
    : AsyncWorker(env),
      fifo_(fifo),
      buf_(buf),
      nb_elems_(nb_elems),
      result_(0),
      deferred_(Napi::Promise::Deferred::New(env)) {
  }

  void Execute() override {
    // Null checks to prevent use-after-free crashes
    if (!fifo_) {
      result_ = AVERROR(EINVAL);
      return;
    }

    // Note: av_fifo_read returns 0 on success (not number of elements read) in FFmpeg 8.0+
    int ret = av_fifo_read(fifo_, buf_, nb_elems_);
    // Store number of elements read on success, 0 if empty, or error code
    if (ret >= 0) {
      result_ = static_cast<int>(nb_elems_);
    } else if (ret == AVERROR(EINVAL)) {
      // FIFO is empty - return 0 elements read instead of error
      result_ = 0;
    } else {
      result_ = ret;
    }
  }

  void OnOK() override {
    deferred_.Resolve(Napi::Number::New(Env(), result_));
  }

  void OnError(const Napi::Error& error) override {
    deferred_.Reject(error.Value());
  }

  Napi::Promise GetPromise() { return deferred_.Promise(); }

private:
  AVFifo* fifo_;
  void* buf_;
  size_t nb_elems_;
  int result_;
  Napi::Promise::Deferred deferred_;
};

class FifoPeekWorker : public Napi::AsyncWorker {
public:
  FifoPeekWorker(Napi::Env env, AVFifo* fifo, void* buf, size_t nb_elems, size_t offset)
    : AsyncWorker(env),
      fifo_(fifo),
      buf_(buf),
      nb_elems_(nb_elems),
      offset_(offset),
      result_(0),
      deferred_(Napi::Promise::Deferred::New(env)) {
  }

  void Execute() override {
    // Null checks to prevent use-after-free crashes
    if (!fifo_) {
      result_ = AVERROR(EINVAL);
      return;
    }

    // Note: av_fifo_peek returns 0 on success (not number of elements peeked) in FFmpeg 8.0+
    int ret = av_fifo_peek(fifo_, buf_, nb_elems_, offset_);
    // Store number of elements peeked on success, or error code
    result_ = ret >= 0 ? static_cast<int>(nb_elems_) : ret;
  }

  void OnOK() override {
    deferred_.Resolve(Napi::Number::New(Env(), result_));
  }

  void OnError(const Napi::Error& error) override {
    deferred_.Reject(error.Value());
  }

  Napi::Promise GetPromise() { return deferred_.Promise(); }

private:
  AVFifo* fifo_;
  void* buf_;
  size_t nb_elems_;
  size_t offset_;
  int result_;
  Napi::Promise::Deferred deferred_;
};

Napi::Value Fifo::WriteAsync(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  if (!fifo_) {
    Napi::Error::New(env, "Fifo not allocated").ThrowAsJavaScriptException();
    return env.Undefined();
  }

  if (info.Length() < 2) {
    Napi::TypeError::New(env, "Expected 2 arguments (buf, nb_elems)").ThrowAsJavaScriptException();
    return env.Undefined();
  }

  if (!info[0].IsBuffer()) {
    Napi::TypeError::New(env, "Expected Buffer").ThrowAsJavaScriptException();
    return env.Undefined();
  }

  Napi::Buffer<uint8_t> buffer = info[0].As<Napi::Buffer<uint8_t>>();
  size_t nb_elems = static_cast<size_t>(info[1].As<Napi::Number>().Int64Value());

  auto* worker = new FifoWriteWorker(env, fifo_, buffer.Data(), nb_elems);
  auto promise = worker->GetPromise();
  worker->Queue();

  return promise;
}

Napi::Value Fifo::ReadAsync(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  if (!fifo_) {
    Napi::Error::New(env, "Fifo not allocated").ThrowAsJavaScriptException();
    return env.Undefined();
  }

  if (info.Length() < 2) {
    Napi::TypeError::New(env, "Expected 2 arguments (buf, nb_elems)").ThrowAsJavaScriptException();
    return env.Undefined();
  }

  if (!info[0].IsBuffer()) {
    Napi::TypeError::New(env, "Expected Buffer").ThrowAsJavaScriptException();
    return env.Undefined();
  }

  Napi::Buffer<uint8_t> buffer = info[0].As<Napi::Buffer<uint8_t>>();
  size_t nb_elems = static_cast<size_t>(info[1].As<Napi::Number>().Int64Value());

  auto* worker = new FifoReadWorker(env, fifo_, buffer.Data(), nb_elems);
  auto promise = worker->GetPromise();
  worker->Queue();

  return promise;
}

Napi::Value Fifo::PeekAsync(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  if (!fifo_) {
    Napi::Error::New(env, "Fifo not allocated").ThrowAsJavaScriptException();
    return env.Undefined();
  }

  if (info.Length() < 2) {
    Napi::TypeError::New(env, "Expected 2 or 3 arguments (buf, nb_elems, [offset])").ThrowAsJavaScriptException();
    return env.Undefined();
  }

  if (!info[0].IsBuffer()) {
    Napi::TypeError::New(env, "Expected Buffer").ThrowAsJavaScriptException();
    return env.Undefined();
  }

  Napi::Buffer<uint8_t> buffer = info[0].As<Napi::Buffer<uint8_t>>();
  size_t nb_elems = static_cast<size_t>(info[1].As<Napi::Number>().Int64Value());
  size_t offset = 0;

  if (info.Length() >= 3) {
    offset = static_cast<size_t>(info[2].As<Napi::Number>().Int64Value());
  }

  auto* worker = new FifoPeekWorker(env, fifo_, buffer.Data(), nb_elems, offset);
  auto promise = worker->GetPromise();
  worker->Queue();

  return promise;
}

} // namespace ffmpeg
