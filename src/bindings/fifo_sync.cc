#include "fifo.h"
#include <napi.h>

extern "C" {
#include <libavutil/fifo.h>
#include <libavutil/mem.h>
}

namespace ffmpeg {

Napi::Value Fifo::WriteSync(const Napi::CallbackInfo& info) {
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

  // Direct synchronous call
  // Note: av_fifo_write returns 0 on success (not number of elements written) in FFmpeg 8.0+
  int ret = av_fifo_write(fifo_, buffer.Data(), nb_elems);

  // Return number of elements written on success, or error code
  return Napi::Number::New(env, ret >= 0 ? static_cast<int>(nb_elems) : ret);
}

Napi::Value Fifo::ReadSync(const Napi::CallbackInfo& info) {
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

  // Direct synchronous call
  // Note: av_fifo_read returns 0 on success (not number of elements read) in FFmpeg 8.0+
  int ret = av_fifo_read(fifo_, buffer.Data(), nb_elems);

  // Return number of elements read on success, 0 if FIFO is empty, or error code
  if (ret >= 0) {
    return Napi::Number::New(env, static_cast<int>(nb_elems));
  } else if (ret == AVERROR(EINVAL)) {
    // FIFO is empty - return 0 elements read instead of error
    return Napi::Number::New(env, 0);
  } else {
    return Napi::Number::New(env, ret);
  }
}

Napi::Value Fifo::PeekSync(const Napi::CallbackInfo& info) {
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

  // Direct synchronous call
  // Note: av_fifo_peek returns 0 on success (not number of elements peeked) in FFmpeg 8.0+
  int ret = av_fifo_peek(fifo_, buffer.Data(), nb_elems, offset);

  // Return number of elements peeked on success, or error code
  return Napi::Number::New(env, ret >= 0 ? static_cast<int>(nb_elems) : ret);
}

} // namespace ffmpeg
