#include <algorithm>
#include <cmath>
#include <cstddef>
#include <cstdlib>
#include <exception>
#include <iostream>
#include <limits>
#include <stdexcept>
#include <string>
#include <vector>

namespace hfnie {

constexpr const char* kVersion = "0.1.0";
constexpr std::size_t kDefaultMemoryLimitBytes = 64U * 1024U * 1024U;

std::size_t checked_elements(std::size_t rows, std::size_t cols) {
    if (rows == 0 || cols == 0) throw std::invalid_argument("tensor dimensions must be non-zero");
    if (rows > std::numeric_limits<std::size_t>::max() / cols)
        throw std::overflow_error("tensor dimensions overflow");
    return rows * cols;
}

class Tensor {
public:
    Tensor(std::size_t rows, std::size_t cols,
           std::size_t memory_limit = kDefaultMemoryLimitBytes)
        : rows_(rows), cols_(cols), values_(allocate(rows, cols, memory_limit)) {}

    std::size_t rows() const noexcept { return rows_; }
    std::size_t cols() const noexcept { return cols_; }
    std::size_t size() const noexcept { return values_.size(); }

    float& at(std::size_t row, std::size_t col) {
        if (row >= rows_ || col >= cols_) throw std::out_of_range("tensor index out of range");
        return values_[row * cols_ + col];
    }

    float at(std::size_t row, std::size_t col) const {
        if (row >= rows_ || col >= cols_) throw std::out_of_range("tensor index out of range");
        return values_[row * cols_ + col];
    }

    std::vector<float>& data() noexcept { return values_; }
    const std::vector<float>& data() const noexcept { return values_; }

private:
    static std::vector<float> allocate(std::size_t rows, std::size_t cols,
                                       std::size_t memory_limit) {
        const std::size_t elements = checked_elements(rows, cols);
        if (elements > memory_limit / sizeof(float))
            throw std::length_error("tensor exceeds configured memory limit");
        return std::vector<float>(elements);
    }

    std::size_t rows_;
    std::size_t cols_;
    std::vector<float> values_;
};

Tensor matmul(const Tensor& lhs, const Tensor& rhs,
              std::size_t memory_limit = kDefaultMemoryLimitBytes) {
    if (lhs.cols() != rhs.rows()) throw std::invalid_argument("matmul shape mismatch");
    Tensor out(lhs.rows(), rhs.cols(), memory_limit);
    for (std::size_t i = 0; i < lhs.rows(); ++i) {
        for (std::size_t k = 0; k < lhs.cols(); ++k) {
            const float a = lhs.at(i, k);
            for (std::size_t j = 0; j < rhs.cols(); ++j)
                out.at(i, j) += a * rhs.at(k, j);
        }
    }
    return out;
}

std::vector<float> rms_norm(const std::vector<float>& input,
                            const std::vector<float>& weight,
                            float epsilon = 1.0e-5F) {
    if (input.empty() || input.size() != weight.size())
        throw std::invalid_argument("RMSNorm input and weight sizes must match and be non-empty");
    if (!(epsilon > 0.0F) || !std::isfinite(epsilon))
        throw std::invalid_argument("RMSNorm epsilon must be finite and positive");

    double square_sum = 0.0;
    for (float value : input) {
        if (!std::isfinite(value)) throw std::invalid_argument("RMSNorm input must be finite");
        square_sum += static_cast<double>(value) * static_cast<double>(value);
    }
    const float inverse_rms = 1.0F / std::sqrt(
        static_cast<float>(square_sum / static_cast<double>(input.size())) + epsilon);

    std::vector<float> output(input.size());
    for (std::size_t i = 0; i < input.size(); ++i) {
        if (!std::isfinite(weight[i])) throw std::invalid_argument("RMSNorm weight must be finite");
        output[i] = input[i] * inverse_rms * weight[i];
    }
    return output;
}

std::vector<float> softmax(const std::vector<float>& logits) {
    if (logits.empty()) throw std::invalid_argument("softmax input must not be empty");
    for (float value : logits)
        if (!std::isfinite(value)) throw std::invalid_argument("softmax logits must be finite");

    const float maximum = *std::max_element(logits.begin(), logits.end());
    std::vector<float> output(logits.size());
    double denominator = 0.0;
    for (std::size_t i = 0; i < logits.size(); ++i) {
        output[i] = std::exp(logits[i] - maximum);
        denominator += output[i];
    }
    if (!(denominator > 0.0) || !std::isfinite(denominator))
        throw std::runtime_error("softmax normalization failed");
    for (float& value : output) value = static_cast<float>(value / denominator);
    return output;
}

std::size_t argmax(const std::vector<float>& values) {
    if (values.empty()) throw std::invalid_argument("argmax input must not be empty");
    return static_cast<std::size_t>(
        std::distance(values.begin(), std::max_element(values.begin(), values.end())));
}

bool nearly_equal(float actual, float expected, float tolerance = 1.0e-4F) {
    return std::fabs(actual - expected) <= tolerance;
}

void require(bool condition, const std::string& message) {
    if (!condition) throw std::runtime_error("self-test failed: " + message);
}

void self_test() {
    Tensor a(2, 3);
    Tensor b(3, 2);
    const float av[] = {1, 2, 3, 4, 5, 6};
    const float bv[] = {7, 8, 9, 10, 11, 12};
    for (std::size_t i = 0; i < 6; ++i) {
        a.data()[i] = av[i];
        b.data()[i] = bv[i];
    }
    const Tensor product = matmul(a, b);
    require(nearly_equal(product.at(0, 0), 58.0F), "matmul[0,0]");
    require(nearly_equal(product.at(0, 1), 64.0F), "matmul[0,1]");
    require(nearly_equal(product.at(1, 0), 139.0F), "matmul[1,0]");
    require(nearly_equal(product.at(1, 1), 154.0F), "matmul[1,1]");

    const auto probabilities = softmax({1000.0F, 1001.0F, 999.0F});
    const float sum = probabilities[0] + probabilities[1] + probabilities[2];
    require(nearly_equal(sum, 1.0F), "softmax probabilities sum to one");
    require(argmax(probabilities) == 1U, "greedy argmax");

    const auto normalized = rms_norm({1.0F, 1.0F}, {1.0F, 1.0F});
    require(nearly_equal(normalized[0], normalized[1]), "RMSNorm symmetry");

    bool rejected = false;
    try { Tensor too_large(1024, 1024, 1024); }
    catch (const std::length_error&) { rejected = true; }
    require(rejected, "memory limit enforcement");

    rejected = false;
    try { (void)matmul(a, Tensor(2, 2)); }
    catch (const std::invalid_argument&) { rejected = true; }
    require(rejected, "matmul shape validation");

    std::cout << "HF-NIE " << kVersion << " self-test: PASS\n"
              << "kernels: matmul, rms_norm, softmax, greedy_argmax\n"
              << "guards: shape_validation, allocation_limit, finite_values\n";
}

} // namespace hfnie

int main(int argc, char** argv) {
    try {
        if (argc == 2 && std::string(argv[1]) == "--self-test") {
            hfnie::self_test();
            return EXIT_SUCCESS;
        }
        if (argc == 2 && std::string(argv[1]) == "--version") {
            std::cout << "HF-NIE " << hfnie::kVersion << "\n";
            return EXIT_SUCCESS;
        }
        std::cout << "HeavenzFire Native Inference Engine " << hfnie::kVersion << "\n"
                  << "Usage: hf-nie --self-test | --version\n"
                  << "Status: compute-kernel foundation; model loading and token generation are not implemented yet.\n";
        return EXIT_SUCCESS;
    } catch (const std::exception& error) {
        std::cerr << "hf-nie: " << error.what() << "\n";
        return EXIT_FAILURE;
    }
}
