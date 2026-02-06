# Infrastructure Prerequisites (Terraform + Cloud CLIs)

This folder contains Infrastructure as Code for AWS, Azure, and GCP. Install Terraform
and the required cloud CLIs, then authenticate before using any stack.

## Required Versions
- Terraform 1.13+
- AWS CLI v2
- Azure CLI
- Google Cloud SDK

## Ubuntu

Terraform:

```bash
sudo apt-get update
sudo apt-get install -y gnupg software-properties-common
wget -O- https://apt.releases.hashicorp.com/gpg | sudo gpg --dearmor -o /usr/share/keyrings/hashicorp-archive-keyring.gpg
echo "deb [signed-by=/usr/share/keyrings/hashicorp-archive-keyring.gpg] https://apt.releases.hashicorp.com $(lsb_release -cs) main" \
  | sudo tee /etc/apt/sources.list.d/hashicorp.list
sudo apt-get update
sudo apt-get install -y terraform
terraform version
```

AWS CLI v2:

```bash
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
sudo apt-get install -y unzip
unzip awscliv2.zip
sudo ./aws/install
aws --version
```

Configure:

```bash
aws configure
```

Azure CLI:

```bash
curl -sL https://aka.ms/InstallAzureCLIDeb | sudo bash
az version
```

Authenticate:

```bash
az login
```

Google Cloud SDK:

```bash
sudo apt-get install -y apt-transport-https ca-certificates gnupg
echo "deb [signed-by=/usr/share/keyrings/cloud.google.gpg] https://packages.cloud.google.com/apt cloud-sdk main" \
  | sudo tee /etc/apt/sources.list.d/google-cloud-sdk.list
curl https://packages.cloud.google.com/apt/doc/apt-key.gpg | sudo gpg --dearmor -o /usr/share/keyrings/cloud.google.gpg
sudo apt-get update
sudo apt-get install -y google-cloud-cli
gcloud --version
```

Authenticate:

```bash
gcloud auth login
```

## macOS

Terraform (Homebrew):

```bash
brew update
brew install terraform
terraform version
```

AWS CLI v2 (Homebrew):

```bash
brew install awscli
aws --version
```

Configure:

```bash
aws configure
```

Azure CLI (Homebrew):

```bash
brew update
brew install azure-cli
az version
```

Authenticate:

```bash
az login
```

Google Cloud SDK (Homebrew):

```bash
brew update
brew install --cask google-cloud-sdk
gcloud --version
```

Authenticate:

```bash
gcloud auth login
```

## Windows

Terraform (winget):

```powershell
winget install HashiCorp.Terraform
terraform version
```

AWS CLI v2 (winget):

```powershell
winget install Amazon.AWSCLI
aws --version
```

Configure:

```powershell
aws configure
```

Azure CLI (winget):

```powershell
winget install Microsoft.AzureCLI
az version
```

Authenticate:

```powershell
az login
```

Google Cloud SDK (winget):

```powershell
winget install Google.CloudSDK
gcloud --version
```

Authenticate:

```powershell
gcloud auth login
```

## Azure Terraform State

Azure stacks use an Azure Storage backend. Create a storage account and a
container, then update the `hcl/backend-*.hcl` files under
`infra/azure/aks` and `infra/azure/aca`.

## GCP Terraform State

GCP stacks use a GCS backend. Create a GCS bucket and update the
`hcl/backend-*.hcl` files under `infra/gcp/gke` and `infra/gcp/cloud-run`.
