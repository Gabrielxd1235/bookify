# BOOKIFY - CRUD integration smoke test
# Run only against an authorized test environment.

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

$BaseUrl = "http://localhost:3000"
$script:Passed = 0

# --------------------------------------------------
# HTTP RESPONSE VALIDATION
# --------------------------------------------------

function Assert-Status {
    param(
        $Result,
        [int]$Expected,
        [string]$TestName
    )

    if ($Result.Status -ne $Expected) {
        $details = ""

        if ($Result.Data -and $Result.Data.message) {
            $details = " | $($Result.Data.message)"
        }
        elseif ($Result.Raw) {
            $details = " | $($Result.Raw)"
        }

        throw "$TestName FAILED: Expected HTTP $Expected, received HTTP $($Result.Status)$details"
    }

    $script:Passed++

    Write-Host "[PASS] $TestName - HTTP $Expected" -ForegroundColor Green
}

# --------------------------------------------------
# HTTP REQUEST HELPER
# --------------------------------------------------

function Invoke-Bookify {
    param(
        [string]$Method,
        [string]$Path,
        [string]$Token = "",
        $Body = $null
    )

    $headers = @{}

    if ($Token) {
        $headers["Authorization"] = "Bearer $Token"
    }

    $params = @{
        Uri = "$BaseUrl$Path"
        Method = $Method
        Headers = $headers
        UseBasicParsing = $true
    }

    if ($null -ne $Body) {
        $params["ContentType"] = "application/json"
        $params["Body"] = ($Body | ConvertTo-Json -Depth 10)
    }

    try {
        $response = Invoke-WebRequest @params

        $data = $null

        if ($response.Content) {
            $data = $response.Content | ConvertFrom-Json
        }

        return [pscustomobject]@{
            Status = [int]$response.StatusCode
            Data = $data
            Raw = $response.Content
        }
    }
    catch {
        if ($null -eq $_.Exception.Response) {
            throw
        }

        $status = [int]$_.Exception.Response.StatusCode
        $bodyText = $_.ErrorDetails.Message

        if (-not $bodyText) {
            try {
                $stream = $_.Exception.Response.GetResponseStream()

                if ($stream) {
                    $reader = New-Object System.IO.StreamReader($stream)

                    try {
                        $bodyText = $reader.ReadToEnd()
                    }
                    finally {
                        $reader.Dispose()
                    }
                }
            }
            catch {
                $bodyText = ""
            }
        }

        $data = $null

        if ($bodyText) {
            try {
                $data = $bodyText | ConvertFrom-Json
            }
            catch {
                $data = $null
            }
        }

        return [pscustomobject]@{
            Status = $status
            Data = $data
            Raw = $bodyText
        }
    }
}

# --------------------------------------------------
# AUTHENTICATION
# --------------------------------------------------

function Get-AccessToken {
    param(
        [string]$Email,
        [string]$Password
    )

    $response = Invoke-Bookify `
        -Method "POST" `
        -Path "/api/auth/login" `
        -Body @{
            email = $Email
            password = $Password
        }

    if ($response.Status -ne 200) {
        throw "Login failed for $Email (HTTP $($response.Status))"
    }

    $token = $response.Data.accessToken

    if (-not $token -and $response.Data.data) {
        $token = $response.Data.data.accessToken
    }

    if (-not $token) {
        throw "Login succeeded but no access token was found"
    }

    return $token
}

# --------------------------------------------------
# SAFE CLEANUP
# --------------------------------------------------

function Invoke-Cleanup {
    param(
        [string]$Method,
        [string]$Path,
        [string]$Token,
        [string]$ResourceName
    )

    try {
        $result = Invoke-Bookify `
            -Method $Method `
            -Path $Path `
            -Token $Token

        if ($result.Status -eq 200 -or $result.Status -eq 404) {
            Write-Host "[CLEANUP] $ResourceName - HTTP $($result.Status)" `
                -ForegroundColor DarkGray
        }
        else {
            Write-Warning "Cleanup failed for $ResourceName (HTTP $($result.Status))"
        }
    }
    catch {
        Write-Warning "Cleanup error for ${ResourceName}: $($_.Exception.Message)"
    }
}

# --------------------------------------------------
# TEST INITIALIZATION
# --------------------------------------------------

Write-Host "`n================================" -ForegroundColor Cyan
Write-Host "BOOKIFY CRUD INTEGRATION TEST" -ForegroundColor Cyan
Write-Host "================================" -ForegroundColor Cyan

# Collect credentials without displaying passwords
$adminEmail = Read-Host "ADMIN email"
$adminSecure = Read-Host "ADMIN password" -AsSecureString

$ownerEmail = Read-Host "BUSINESS_OWNER email"
$ownerSecure = Read-Host "BUSINESS_OWNER password" -AsSecureString

$adminPassword = [System.Net.NetworkCredential]::new(
    "",
    $adminSecure
).Password

$ownerPassword = [System.Net.NetworkCredential]::new(
    "",
    $ownerSecure
).Password

try {
    $adminToken = Get-AccessToken $adminEmail $adminPassword
    $ownerToken = Get-AccessToken $ownerEmail $ownerPassword
}
finally {
    $adminPassword = $null
    $ownerPassword = $null

    Remove-Variable adminSecure, ownerSecure -ErrorAction SilentlyContinue
}

Write-Host "`nAuthentication successful." -ForegroundColor Green

# --------------------------------------------------
# EXISTING CATEGORY
# --------------------------------------------------

$categoriesResult = Invoke-Bookify `
    -Method "GET" `
    -Path "/api/categories?page=1&limit=10"

Assert-Status $categoriesResult 200 "List categories"

$existingCategory = @($categoriesResult.Data.categories) |
    Select-Object -First 1

if (-not $existingCategory) {
    throw "At least one existing category is required"
}

$existingCategoryId = $existingCategory.id

# --------------------------------------------------
# TEST RESOURCE TRACKING
# --------------------------------------------------

$categoryId = $null
$businessId = $null
$serviceId = $null

$hoursCreated = $false
$weekday = $null

$unique = [guid]::NewGuid().ToString("N").Substring(0, 8)

try {

    # ==============================================
    # CATEGORY CRUD
    # ==============================================

    Write-Host "`nCATEGORY CRUD" -ForegroundColor Cyan

    # CREATE CATEGORY
    $result = Invoke-Bookify `
        -Method "POST" `
        -Path "/api/categories" `
        -Token $adminToken `
        -Body @{
            name = "QA Category $unique"
            description = "Automated CRUD test"
        }

    if ($result.Status -eq 201) {
        $categoryId = $result.Data.category.id
    }

    Assert-Status $result 201 "Create category"

    # READ CATEGORY
    $result = Invoke-Bookify `
        -Method "GET" `
        -Path "/api/categories/$categoryId"

    Assert-Status $result 200 "Read category"

    # UPDATE CATEGORY
    $result = Invoke-Bookify `
        -Method "PUT" `
        -Path "/api/categories/$categoryId" `
        -Token $adminToken `
        -Body @{
            name = "QA Updated $unique"
        }

    Assert-Status $result 200 "Update category"

    # VERIFY CATEGORY PERMISSIONS
    $result = Invoke-Bookify `
        -Method "DELETE" `
        -Path "/api/categories/$categoryId" `
        -Token $ownerToken

    Assert-Status $result 403 "Owner cannot delete category"

    # DELETE CATEGORY
    $result = Invoke-Bookify `
        -Method "DELETE" `
        -Path "/api/categories/$categoryId" `
        -Token $adminToken

    Assert-Status $result 200 "Delete category"

    $categoryId = $null

    # ==============================================
    # BUSINESS CRUD
    # ==============================================

    Write-Host "`nBUSINESS CRUD" -ForegroundColor Cyan

    # CREATE BUSINESS
    $result = Invoke-Bookify `
        -Method "POST" `
        -Path "/api/businesses" `
        -Token $ownerToken `
        -Body @{
            name = "QA Barbershop $unique"
            category_id = $existingCategoryId
            description = "Automated business test"
            address = "Arequipa, Peru"
            phone = "999888777"
        }

    if ($result.Status -eq 201) {
        $businessId = $result.Data.business.id
    }

    Assert-Status $result 201 "Create business"

    # READ BUSINESS
    $result = Invoke-Bookify `
        -Method "GET" `
        -Path "/api/businesses/$businessId"

    Assert-Status $result 200 "Read business"

    # UPDATE BUSINESS
    $result = Invoke-Bookify `
        -Method "PUT" `
        -Path "/api/businesses/$businessId" `
        -Token $ownerToken `
        -Body @{
            name = "QA Updated Barbershop $unique"
        }

    Assert-Status $result 200 "Update business"

    # LIST OWNER'S BUSINESSES
    $result = Invoke-Bookify `
        -Method "GET" `
        -Path "/api/businesses/mine" `
        -Token $ownerToken

    Assert-Status $result 200 "List owner's businesses"

    # ==============================================
    # SERVICE CRUD
    # ==============================================

    Write-Host "`nSERVICE CRUD" -ForegroundColor Cyan

    # CREATE SERVICE
    $result = Invoke-Bookify `
        -Method "POST" `
        -Path "/api/services" `
        -Token $ownerToken `
        -Body @{
            business_id = $businessId
            name = "QA Haircut $unique"
            description = "Automated service test"
            price = 40
            duration_minutes = 45
        }

    if ($result.Status -eq 201) {
        $serviceId = $result.Data.service.id
    }

    Assert-Status $result 201 "Create service"

    # READ SERVICE
    $result = Invoke-Bookify `
        -Method "GET" `
        -Path "/api/services/$serviceId"

    Assert-Status $result 200 "Read service"

    # UPDATE SERVICE
    $result = Invoke-Bookify `
        -Method "PUT" `
        -Path "/api/services/$serviceId" `
        -Token $ownerToken `
        -Body @{
            name = "QA Premium Haircut $unique"
            price = 50
        }

    Assert-Status $result 200 "Update service"

    # IMPORTANT:
    # Keep the service active until all availability tests finish.

    # ==============================================
    # BUSINESS HOURS TESTS
    # ==============================================

    Write-Host "`nBUSINESS HOURS TESTS" -ForegroundColor Cyan

    # Calculate a future appointment date
    $testDate = (Get-Date).Date.AddDays(14)

    $weekday = [int]$testDate.DayOfWeek
    $dateString = $testDate.ToString("yyyy-MM-dd")

    Write-Host "Test date: $dateString" -ForegroundColor Yellow
    Write-Host "Test weekday: $weekday" -ForegroundColor Yellow

    # CREATE BUSINESS HOURS
    $result = Invoke-Bookify `
        -Method "POST" `
        -Path "/api/businesses/$businessId/hours" `
        -Token $ownerToken `
        -Body @{
            weekday = $weekday
            opens_at = "09:00"
            closes_at = "17:00"
            is_closed = $false
        }

    if ($result.Status -eq 201) {
        $hoursCreated = $true
    }

    Assert-Status $result 201 "Create business hours"

    # READ BUSINESS HOURS
    $result = Invoke-Bookify `
        -Method "GET" `
        -Path "/api/businesses/$businessId/hours"

    Assert-Status $result 200 "Read business hours"

    # REJECT DUPLICATE BUSINESS HOURS
    $result = Invoke-Bookify `
        -Method "POST" `
        -Path "/api/businesses/$businessId/hours" `
        -Token $ownerToken `
        -Body @{
            weekday = $weekday
            opens_at = "09:00"
            closes_at = "17:00"
            is_closed = $false
        }

    Assert-Status $result 409 "Reject duplicate business hours"

    # UPDATE BUSINESS HOURS
    $result = Invoke-Bookify `
        -Method "PUT" `
        -Path "/api/businesses/$businessId/hours/$weekday" `
        -Token $ownerToken `
        -Body @{
            opens_at = "10:00"
            closes_at = "18:00"
            is_closed = $false
        }

    Assert-Status $result 200 "Update business hours"

    # REJECT INVALID BUSINESS HOURS
    $result = Invoke-Bookify `
        -Method "PUT" `
        -Path "/api/businesses/$businessId/hours/$weekday" `
        -Token $ownerToken `
        -Body @{
            opens_at = "18:00"
            closes_at = "10:00"
            is_closed = $false
        }

    Assert-Status $result 400 "Reject invalid business hours"

    # ==============================================
    # RESERVATION AVAILABILITY TESTS
    # ==============================================

    Write-Host "`nRESERVATION AVAILABILITY TESTS" -ForegroundColor Cyan

    # The service is still active at this point.
    # Business hours have already been created.

    $availabilityPath = "/api/reservations/availability?service_id=$serviceId&date=$dateString"

    $result = Invoke-Bookify `
        -Method "GET" `
        -Path $availabilityPath

    Assert-Status $result 200 "Get available appointment slots"

    Write-Host "`nAvailable slots response:" -ForegroundColor Yellow

    $result.Data |
        ConvertTo-Json -Depth 10 |
        Write-Host

    # ==============================================
    # BUSINESS HOURS CLEANUP
    # ==============================================

    Write-Host "`nBUSINESS HOURS CLEANUP" -ForegroundColor Cyan

    # DELETE BUSINESS HOURS
    $result = Invoke-Bookify `
        -Method "DELETE" `
        -Path "/api/businesses/$businessId/hours/$weekday" `
        -Token $ownerToken

    Assert-Status $result 200 "Delete business hours"

    $hoursCreated = $false

    # ==============================================
    # SERVICE CLEANUP
    # ==============================================

    Write-Host "`nSERVICE CLEANUP" -ForegroundColor Cyan

    # DEACTIVATE SERVICE AFTER AVAILABILITY TESTS
    $result = Invoke-Bookify `
        -Method "DELETE" `
        -Path "/api/services/$serviceId" `
        -Token $ownerToken

    Assert-Status $result 200 "Deactivate service"

    $serviceId = $null

    # ==============================================
    # BUSINESS CLEANUP
    # ==============================================

    Write-Host "`nBUSINESS CLEANUP" -ForegroundColor Cyan

    # DEACTIVATE BUSINESS
    $result = Invoke-Bookify `
        -Method "DELETE" `
        -Path "/api/businesses/$businessId" `
        -Token $ownerToken

    Assert-Status $result 200 "Deactivate business"

    $businessId = $null

    # ==============================================
    # FINAL RESULTS
    # ==============================================

    Write-Host "`n================================" -ForegroundColor Green
    Write-Host "BOOKIFY CRUD TEST COMPLETED" -ForegroundColor Green
    Write-Host "Checks passed: $script:Passed" -ForegroundColor Green
    Write-Host "================================" -ForegroundColor Green

}
finally {

    # ==============================================
    # EMERGENCY CLEANUP
    # ==============================================

    # Clean up any resources left behind if a test fails.
    # Only resources created by this test are targeted.

    if ($hoursCreated -and $businessId) {
        Invoke-Cleanup `
            -Method "DELETE" `
            -Path "/api/businesses/$businessId/hours/$weekday" `
            -Token $ownerToken `
            -ResourceName "Business hours"
    }

    if ($serviceId) {
        Invoke-Cleanup `
            -Method "DELETE" `
            -Path "/api/services/$serviceId" `
            -Token $ownerToken `
            -ResourceName "Test service"
    }

    if ($businessId) {
        Invoke-Cleanup `
            -Method "DELETE" `
            -Path "/api/businesses/$businessId" `
            -Token $ownerToken `
            -ResourceName "Test business"
    }

    if ($categoryId) {
        Invoke-Cleanup `
            -Method "DELETE" `
            -Path "/api/categories/$categoryId" `
            -Token $adminToken `
            -ResourceName "Test category"
    }
}