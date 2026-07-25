#pragma once

#include <cmath>
#include <cstdint>
#include <exception>
#include <istream>
#include <memory>
#include <string>
#include <unordered_map>
#include <vector>

#include "core/util.h"
#include "ggml.h"
#include "json.hpp"
#include "model_io/tensor_storage.h"

namespace kcpp_safetensors_quant {

struct LayerInfo {
    std::string format;
    bool convrot          = false;
    int convrot_groupsize = 0;
};

using LayerMap = std::unordered_map<std::string, LayerInfo>;

struct TensorStorageExt {
    bool is_i8_tensorwise        = false;
    bool convrot                 = false;
    int convrot_groupsize        = 0;
    ggml_type scale_type         = GGML_TYPE_F32;
    int64_t scale_ne[SD_MAX_DIMS] = {1, 1, 1, 1, 1};
    int scale_n_dims             = 0;
    uint64_t scale_offset        = 0;

    int64_t scale_nelements() const {
        int64_t n = 1;
        for (int i = 0; i < SD_MAX_DIMS; i++) {
            n *= scale_ne[i];
        }
        return n;
    }

    int64_t scale_nbytes() const {
        return scale_nelements() * ggml_type_size(scale_type) / ggml_blck_size(scale_type);
    }
};

inline void set_error(std::string* error, const std::string& message) {
    if (error != nullptr) {
        *error = message;
    }
}

inline ggml_type scale_dtype_to_ggml_type(const std::string& dtype) {
    if (dtype == "F32") {
        return GGML_TYPE_F32;
    }
    if (dtype == "F16") {
        return GGML_TYPE_F16;
    }
    if (dtype == "BF16") {
        return GGML_TYPE_BF16;
    }
    return GGML_TYPE_COUNT;
}

inline LayerMap read_quantization_metadata(const nlohmann::json& header) {
    LayerMap layers;
    if (!header.contains("__metadata__") || !header["__metadata__"].is_object()) {
        return layers;
    }

    const nlohmann::json& metadata = header["__metadata__"];
    if (!metadata.contains("_quantization_metadata") || !metadata["_quantization_metadata"].is_string()) {
        return layers;
    }

    try {
        nlohmann::json quant_metadata = nlohmann::json::parse(metadata["_quantization_metadata"].get<std::string>());
        if (!quant_metadata.contains("layers") || !quant_metadata["layers"].is_object()) {
            return layers;
        }

        for (const auto& layer_item : quant_metadata["layers"].items()) {
            if (!layer_item.value().is_object()) {
                continue;
            }

            LayerInfo layer;
            const nlohmann::json& layer_json = layer_item.value();
            if (layer_json.contains("format") && layer_json["format"].is_string()) {
                layer.format = layer_json["format"].get<std::string>();
            }
            if (layer_json.contains("convrot") && layer_json["convrot"].is_boolean()) {
                layer.convrot = layer_json["convrot"].get<bool>();
            }
            if (layer_json.contains("convrot_groupsize") && layer_json["convrot_groupsize"].is_number_integer()) {
                layer.convrot_groupsize = layer_json["convrot_groupsize"].get<int>();
            }
            layers[layer_item.key()] = layer;
        }
    } catch (const std::exception&) {
        layers.clear();
    }
    return layers;
}

inline bool should_skip_side_tensor(const nlohmann::json& header, const std::string& name, const LayerMap& quant_layers) {
    if (!ends_with(name, ".weight_scale")) {
        return false;
    }

    std::string base_name = name.substr(0, name.size() - std::string(".weight_scale").size());
    auto layer_it         = quant_layers.find(base_name);
    if (layer_it != quant_layers.end() && layer_it->second.format == "int8_tensorwise") {
        return true;
    }
    std::string comfy_quant_name = base_name + ".comfy_quant";
    return header.contains(comfy_quant_name) && header[comfy_quant_name].is_object();
}

inline void read_layer_fields(const nlohmann::json& layer_json, LayerInfo& layer) {
    if (layer_json.contains("format") && layer_json["format"].is_string()) {
        layer.format = layer_json["format"].get<std::string>();
    }
    if (layer_json.contains("convrot") && layer_json["convrot"].is_boolean()) {
        layer.convrot = layer_json["convrot"].get<bool>();
    }
    if (layer_json.contains("convrot_groupsize") && layer_json["convrot_groupsize"].is_number_integer()) {
        layer.convrot_groupsize = layer_json["convrot_groupsize"].get<int>();
    } else if (layer_json.contains("convrot_group_size") && layer_json["convrot_group_size"].is_number_integer()) {
        layer.convrot_groupsize = layer_json["convrot_group_size"].get<int>();
    }
}

inline bool read_comfy_quant_layer(const nlohmann::json& header,
                                   std::istream& file,
                                   const std::string& base_name,
                                   size_t data_start,
                                   size_t file_size,
                                   LayerInfo& layer,
                                   std::string* error) {
    std::string comfy_quant_name = base_name + ".comfy_quant";
    if (!header.contains(comfy_quant_name) || !header[comfy_quant_name].is_object()) {
        set_error(error, "unsupported dtype 'I8' without int8_tensorwise metadata (tensor '" + base_name + ".weight')");
        return false;
    }

    const nlohmann::json& comfy_info = header[comfy_quant_name];
    if (!comfy_info.contains("dtype") || comfy_info["dtype"].get<std::string>() != "U8") {
        set_error(error, "unsupported comfy_quant dtype (tensor '" + comfy_quant_name + "')");
        return false;
    }

    size_t begin = comfy_info["data_offsets"][0].get<size_t>();
    size_t end   = comfy_info["data_offsets"][1].get<size_t>();
    if (begin > end || end > file_size - data_start) {
        set_error(error, "data offsets out of bounds for tensor '" + comfy_quant_name + "'");
        return false;
    }

    size_t payload_size = end - begin;
    std::vector<char> payload(payload_size + 1, '\0');
    std::streampos previous_pos = file.tellg();
    file.seekg(data_start + begin);
    file.read(payload.data(), payload_size);
    if (previous_pos != std::streampos(-1)) {
        file.seekg(previous_pos);
    }
    if (!file) {
        set_error(error, "read comfy_quant metadata failed: '" + comfy_quant_name + "'");
        return false;
    }

    try {
        nlohmann::json layer_json = nlohmann::json::parse(payload.data());
        read_layer_fields(layer_json, layer);
    } catch (const std::exception&) {
        set_error(error, "parsing comfy_quant metadata failed: '" + comfy_quant_name + "'");
        return false;
    }
    return true;
}

inline bool fill_i8_tensorwise_storage(const nlohmann::json& header,
                                       std::istream& file,
                                       const LayerMap& quant_layers,
                                       const std::string& name,
                                       size_t data_start,
                                       size_t file_size,
                                       size_t tensor_data_size,
                                       TensorStorage& tensor_storage,
                                       std::string* error) {
    if (!ends_with(name, ".weight")) {
        set_error(error, "unsupported dtype 'I8' (tensor '" + name + "')");
        return false;
    }

    std::string base_name = name.substr(0, name.size() - std::string(".weight").size());
    auto layer_it         = quant_layers.find(base_name);
    LayerInfo layer;
    if (layer_it != quant_layers.end()) {
        layer = layer_it->second;
    } else if (!read_comfy_quant_layer(header, file, base_name, data_start, file_size, layer, error)) {
        return false;
    }

    if (layer.format != "int8_tensorwise") {
        set_error(error, "unsupported dtype 'I8' without int8_tensorwise metadata (tensor '" + name + "')");
        return false;
    }

    std::string scale_name = base_name + ".weight_scale";
    if (!header.contains(scale_name) || !header[scale_name].is_object()) {
        set_error(error, "missing weight_scale for int8 tensor '" + name + "'");
        return false;
    }

    const nlohmann::json& scale_info = header[scale_name];
    std::string scale_dtype          = scale_info["dtype"];
    ggml_type scale_type             = scale_dtype_to_ggml_type(scale_dtype);
    if (scale_type == GGML_TYPE_COUNT) {
        set_error(error, "unsupported scale dtype '" + scale_dtype + "' (tensor '" + scale_name + "')");
        return false;
    }

    size_t scale_begin = scale_info["data_offsets"][0].get<size_t>();
    size_t scale_end   = scale_info["data_offsets"][1].get<size_t>();
    if (scale_begin > scale_end || scale_end > file_size - data_start) {
        set_error(error, "data offsets out of bounds for tensor '" + scale_name + "'");
        return false;
    }

    nlohmann::json scale_shape = scale_info["shape"];
    if (scale_shape.size() > SD_MAX_DIMS) {
        set_error(error, "invalid tensor '" + scale_name + "'");
        return false;
    }

    auto ext = std::make_shared<TensorStorageExt>();
    ext->scale_n_dims = (int)scale_shape.size();
    for (int i = 0; i < SD_MAX_DIMS; i++) {
        ext->scale_ne[i] = 1;
    }
    for (int i = 0; i < ext->scale_n_dims; i++) {
        ext->scale_ne[i] = scale_shape[i].get<int64_t>();
    }
    if (ext->scale_n_dims == 0) {
        ext->scale_n_dims = 1;
    }
    ext->scale_type = scale_type;

    size_t scale_data_size     = scale_end - scale_begin;
    size_t expected_scale_size = ext->scale_nbytes();
    if (scale_data_size != expected_scale_size) {
        set_error(error, "size mismatch for tensor '" + scale_name + "' (" + scale_dtype + ")");
        return false;
    }

    ext->is_i8_tensorwise = true;
    ext->convrot          = layer.convrot;
    ext->convrot_groupsize = layer.convrot_groupsize;
    ext->scale_offset     = data_start + scale_begin;
    tensor_storage.kcpp_ext = ext;
    if (tensor_storage.nbytes_to_read() != (int64_t)tensor_data_size) {
        set_error(error, "size mismatch for tensor '" + name + "' (I8)");
        return false;
    }
    return true;
}

inline bool build_convrot_hadamard_signs(int size, std::vector<int8_t>& signs) {
    if (size < 1 || (size & (size - 1)) != 0) {
        return false;
    }

    int tmp          = size;
    bool power_of_4 = true;
    while (tmp > 1) {
        if (tmp % 4 != 0) {
            power_of_4 = false;
            break;
        }
        tmp /= 4;
    }

    if (!power_of_4) {
        signs.assign(1, 1);
        int current_size = 1;
        while (current_size < size) {
            std::vector<int8_t> next((size_t)current_size * 2 * current_size * 2);
            for (int r = 0; r < current_size; r++) {
                for (int c = 0; c < current_size; c++) {
                    int8_t v = signs[(size_t)r * current_size + c];
                    next[(size_t)r * current_size * 2 + c]                                      = v;
                    next[(size_t)r * current_size * 2 + c + current_size]                       = v;
                    next[(size_t)(r + current_size) * current_size * 2 + c]                     = v;
                    next[(size_t)(r + current_size) * current_size * 2 + c + current_size]      = -v;
                }
            }
            signs.swap(next);
            current_size *= 2;
        }
        return true;
    }

    static const int8_t H4[16] = {
        1, 1, 1, -1,
        1, 1, -1, 1,
        1, -1, 1, 1,
        -1, 1, 1, 1,
    };
    signs.assign(H4, H4 + 16);
    int current_size = 4;
    while (current_size < size) {
        std::vector<int8_t> next((size_t)current_size * 4 * current_size * 4);
        int next_size = current_size * 4;
        for (int r = 0; r < current_size; r++) {
            for (int c = 0; c < current_size; c++) {
                int8_t v = signs[(size_t)r * current_size + c];
                for (int br = 0; br < 4; br++) {
                    for (int bc = 0; bc < 4; bc++) {
                        next[(size_t)(r * 4 + br) * next_size + (c * 4 + bc)] = v * H4[br * 4 + bc];
                    }
                }
            }
        }
        signs.swap(next);
        current_size = next_size;
    }
    return true;
}

inline float read_quant_scale(const void* scale, ggml_type scale_type, int64_t index) {
    if (scale_type == GGML_TYPE_F32) {
        return ((const float*)scale)[index];
    }
    if (scale_type == GGML_TYPE_F16) {
        return ggml_fp16_to_fp32(((const ggml_fp16_t*)scale)[index]);
    }
    if (scale_type == GGML_TYPE_BF16) {
        return ggml_bf16_to_fp32(((const ggml_bf16_t*)scale)[index]);
    }
    return 1.0f;
}

inline bool i8_tensorwise_to_f16_vec(const int8_t* src,
                                     const void* scale,
                                     ggml_type scale_type,
                                     int64_t scale_elements,
                                     ggml_fp16_t* dst,
                                     int64_t rows,
                                     int64_t cols,
                                     bool convrot,
                                     int convrot_groupsize) {
    if (scale_elements != 1 && scale_elements != rows) {
        return false;
    }

    if (!convrot) {
        for (int64_t row = 0; row < rows; row++) {
            float row_scale = read_quant_scale(scale, scale_type, scale_elements == 1 ? 0 : row);
            for (int64_t col = 0; col < cols; col++) {
                dst[row * cols + col] = ggml_fp32_to_fp16((float)src[row * cols + col] * row_scale);
            }
        }
        return true;
    }

    if (convrot_groupsize <= 0 || cols % convrot_groupsize != 0) {
        return false;
    }

    std::vector<int8_t> hadamard;
    if (!build_convrot_hadamard_signs(convrot_groupsize, hadamard)) {
        return false;
    }

    const float norm = 1.0f / std::sqrt((float)convrot_groupsize);
    std::vector<float> dequant_group(convrot_groupsize);
    for (int64_t row = 0; row < rows; row++) {
        float row_scale = read_quant_scale(scale, scale_type, scale_elements == 1 ? 0 : row);
        for (int64_t group_start = 0; group_start < cols; group_start += convrot_groupsize) {
            for (int k = 0; k < convrot_groupsize; k++) {
                dequant_group[k] = (float)src[row * cols + group_start + k] * row_scale;
            }
            for (int j = 0; j < convrot_groupsize; j++) {
                float sum = 0.0f;
                for (int k = 0; k < convrot_groupsize; k++) {
                    sum += dequant_group[k] * (float)hadamard[(size_t)k * convrot_groupsize + j];
                }
                dst[row * cols + group_start + j] = ggml_fp32_to_fp16(sum * norm);
            }
        }
    }
    return true;
}

template <typename ReadDataFn, typename FailedFlag>
inline bool load_i8_tensorwise_to_f16(const TensorStorage& tensor_storage,
                                      const char* read_buf,
                                      char* target_buf,
                                      std::vector<uint8_t>& scale_buffer,
                                      ReadDataFn&& read_data,
                                      FailedFlag& failed,
                                      uint64_t& scale_nbytes) {
    if (!tensor_storage.kcpp_ext) {
        return false;
    }

    const auto& ext = *tensor_storage.kcpp_ext;
    int64_t scale_elements = 1;
    for (int i = 0; i < SD_MAX_DIMS; i++) {
        scale_elements *= ext.scale_ne[i];
    }

    scale_nbytes = (uint64_t)ext.scale_nbytes();
    scale_buffer.resize((size_t)scale_nbytes);
    read_data((char*)scale_buffer.data(), (size_t)scale_nbytes, ext.scale_offset);
    if (failed) {
        return false;
    }

    int64_t cols = tensor_storage.ne[0];
    int64_t rows = tensor_storage.nelements() / cols;
    return i8_tensorwise_to_f16_vec((const int8_t*)read_buf,
                                    scale_buffer.data(),
                                    ext.scale_type,
                                    scale_elements,
                                    (ggml_fp16_t*)target_buf,
                                    rows,
                                    cols,
                                    ext.convrot,
                                    ext.convrot_groupsize);
}

}  // namespace kcpp_safetensors_quant
